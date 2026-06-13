#!/usr/bin/env -S pnpm tsx
/**
 * Backfill ingredient_intelligence table — correct LLM-rated E-number rows
 * using the INS_ROLE_MAP patterns + KNOWN_INGREDIENTS dictionary.
 *
 * The LLM rating pipeline incorrectly classified many E-number ingredients:
 *   - E951 (aspartame) → "thickener" / NOVA 2   (should be sweetener / NOVA 4)
 *   - E211 (sodium benzoate) → "additive"       (should be preservative)
 *   - E621 (MSG) → "thickener" / tier innocuous  (should be flavor / watchful)
 *   - E330 (citric acid) → "thickener"           (should be acid_regulator)
 *
 * This script iterates the ingredient_intelligence table, matches rows whose
 * normalized_name matches an INS/E-number pattern, and applies corrections.
 *
 * Run:  pnpm tsx scripts/backfill-ingredient-intelligence.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { adminClient } from "@/lib/supabase/admin";
import { KNOWN_INGREDIENTS } from "@/lib/scoring/ingredient-known";

/** INS/E-number role map — same as ingredient-known.ts. */
const INS_ROLE_MAP: Array<{ re: RegExp; role: string; nova: number }> = [
  { re: /^(ins|e)\s*1[0-9]{2}[a-z]?$/i, role: "color", nova: 4 },
  { re: /^(ins|e)\s*2[0-9]{2}[a-z]?$/i, role: "preservative", nova: 4 },
  { re: /^(ins|e)\s*3[0-9]{2}[a-z]?$/i, role: "acid_regulator", nova: 4 },
  { re: /^(ins|e)\s*4[0-9]{2}[a-z]?$/i, role: "emulsifier", nova: 4 },
  { re: /^(ins|e)\s*5[0-9]{2}[a-z]?$/i, role: "acid_regulator", nova: 4 },
  { re: /^(ins|e)\s*6[0-9]{2}[a-z]?$/i, role: "flavor", nova: 4 },
  { re: /^(ins|e)\s*9[0-9]{2}[a-z]?$/i, role: "sweetener", nova: 4 },
  { re: /^(ins|e)\s*1[0-9]{3}[a-z]?$/i, role: "starch", nova: 4 },
];

/** Bare-number role map — same as E-number aliases in KNOWN_INGREDIENTS. */
const BARE_NUMBER_MAP: Record<string, { role: string; nova: number; tier: string }> = {
  "950": { role: "sweetener", nova: 4, tier: "watchful" },
  "951": { role: "sweetener", nova: 4, tier: "watchful" },
  "954": { role: "sweetener", nova: 4, tier: "watchful" },
  "955": { role: "sweetener", nova: 4, tier: "watchful" },
  "960": { role: "sweetener", nova: 4, tier: "watchful" },
  "961": { role: "sweetener", nova: 4, tier: "watchful" },
  "202": { role: "preservative", nova: 4, tier: "watchful" },
  "211": { role: "preservative", nova: 4, tier: "watchful" },
  "223": { role: "preservative", nova: 4, tier: "watchful" },
  "102": { role: "color", nova: 4, tier: "watchful" },
  "110": { role: "color", nova: 4, tier: "watchful" },
  "122": { role: "color", nova: 4, tier: "watchful" },
  "129": { role: "color", nova: 4, tier: "watchful" },
  "133": { role: "color", nova: 4, tier: "watchful" },
  "322": { role: "emulsifier", nova: 4, tier: "innocuous" },
  "471": { role: "emulsifier", nova: 4, tier: "watchful" },
  "621": { role: "flavor", nova: 4, tier: "watchful" },
};

function resolveCorrection(
  normalizedName: string,
): { role: string; nova: number; tier: string } | null {
  // 1. Check known-ingredients dictionary (covers named ingredients + E-number aliases)
  const known = KNOWN_INGREDIENTS[normalizedName];
  if (known?.role && known.role !== "base_food") {
    return { role: known.role, nova: known.nova_class, tier: known.concern_tier };
  }

  // 2. Check bare-number map (e.g. "950" → sweetener)
  const bare = BARE_NUMBER_MAP[normalizedName];
  if (bare) return bare;

  // 3. Try INS pattern (e.g. "ins 951" → sweetener)
  for (const { re, role, nova } of INS_ROLE_MAP) {
    if (re.test(normalizedName)) {
      return { role, nova, tier: nova >= 4 ? "watchful" : "innocuous" };
    }
  }

  // 4. Try with stripped prefix (e 951 → 951, ins955 → 955)
  const stripped = normalizedName.replace(/^(?:ins|e)\s*/i, "");
  if (stripped !== normalizedName) {
    const strippedBare = BARE_NUMBER_MAP[stripped];
    if (strippedBare) return strippedBare;
  }

  return null;
}

async function main() {
  const sb = adminClient();
  const PAGE = 500;
  let corrected = 0;
  let skipped = 0;
  let offset = 0;

  console.log("Backfilling ingredient_intelligence...");

  while (true) {
    const { data, error } = await sb
      .from("ingredient_intelligence")
      .select("normalized_name, role, nova_class, concern_tier")
      .order("normalized_name")
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error("Fetch error:", error.message);
      break;
    }
    if (!data?.length) break;

    for (const row of data) {
      const correction = resolveCorrection(row.normalized_name);
      if (!correction) { skipped++; continue; }

      // Only update if the current data is wrong
      const roleWrong = row.role !== correction.role;
      const novaWrong = row.nova_class !== correction.nova;
      const tierWrong = row.concern_tier !== correction.tier;

      if (!roleWrong && !novaWrong && !tierWrong) { skipped++; continue; }

      const updates: Record<string, unknown> = {};
      if (roleWrong) updates.role = correction.role;
      if (novaWrong) updates.nova_class = correction.nova;
      if (tierWrong) updates.concern_tier = correction.tier;

      const { error: upErr } = await sb
        .from("ingredient_intelligence")
        .update(updates)
        .eq("normalized_name", row.normalized_name);

      if (upErr) {
        console.error(`  FAIL ${row.normalized_name}: ${upErr.message}`);
      } else {
        corrected++;
        const changes: string[] = [];
        if (roleWrong) changes.push(`role: ${row.role}→${correction.role}`);
        if (novaWrong) changes.push(`nova: ${row.nova_class}→${correction.nova}`);
        if (tierWrong) changes.push(`tier: ${row.concern_tier}→${correction.tier}`);
        console.log(`  ✓ ${row.normalized_name}: ${changes.join(", ")}`);
      }
    }

    offset += PAGE;
    if (data.length < PAGE) break;
  }

  console.log(`\nDone. Corrected: ${corrected}, Skipped (already correct): ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

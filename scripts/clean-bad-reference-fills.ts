#!/usr/bin/env -S pnpm tsx
/**
 * Clean wrongly-applied reference-seed nutrition.
 *
 * For each product where:
 *   - nutrition.extra.reference_id is set (reference-fill ran)
 *   - AND category/name implies a processed/branded product
 *
 * Wipe the nutrition field. The product reverts to "no nutrition" — which is
 * the correct state until we have real label data (OCR or OpenFoodFacts).
 *
 *   pnpm exec tsx scripts/clean-bad-reference-fills.ts            # dry-run
 *   pnpm exec tsx scripts/clean-bad-reference-fills.ts --apply    # actually wipe
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { adminClient } from "@/lib/supabase/admin";

const DRY_RUN = !process.argv.includes("--apply");

// Allowlist mirrors lib/nutrition/reference-seed.ts
const ALLOWED_CATEGORIES = [
  "Fruits & Vegetables", "Fresh Fruits", "Fresh Vegetables", "Vegetables", "Fruits",
  "Eggs, Meat & Fish", "Chicken, Meat & Fish", "Eggs", "Paneer & Cheese", "Sprouts",
];
const PROCESSED_NAME_RE =
  /\b(milkshake|smoothie|drink|protein|powder|mix|shake|biscuit|cookie|cake|chocolate|ice\s*cream|noodle|chip|snack|bar|wafer|cracker|cereal|muesli|granola|yogurt|peanut\s+butter|jam|spread|sauce|ketchup|pickle|masala\s+mix|instant|fortified|flavoured|flavored)\b/i;

function isAllowed(cat: string | null, sub: string | null): boolean {
  const hay = `${cat ?? ""}|${sub ?? ""}`.toLowerCase();
  return ALLOWED_CATEGORIES.some((c) => hay.includes(c.toLowerCase()));
}

async function main() {
  const s = adminClient();
  const targets: Array<{ id: string; name: string; reason: string }> = [];

  let off = 0;
  while (true) {
    const { data, error } = await s
      .from("products")
      .select("id, name, category, subcategory, nutrition")
      .eq("platform", "zepto")
      .not("nutrition", "is", null)
      .range(off, off + 999);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      const ext = (r.nutrition as { extra?: { reference_id?: string } } | null)?.extra;
      if (!ext?.reference_id) continue;
      const allowed = isAllowed(r.category, r.subcategory);
      const processedName = r.name && PROCESSED_NAME_RE.test(r.name);
      if (!allowed) targets.push({ id: r.id, name: r.name, reason: `disallowed_category(${r.category})` });
      else if (processedName) targets.push({ id: r.id, name: r.name, reason: "processed_name_pattern" });
    }
    if (data.length < 1000) break;
    off += 1000;
  }

  console.log(`Found ${targets.length} contaminated products.`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "APPLY (will wipe nutrition)"}`);
  console.log("\nFirst 15 targets:");
  for (const t of targets.slice(0, 15)) {
    console.log(`  ${t.name?.slice(0, 60)} [${t.reason}]`);
  }
  if (DRY_RUN) {
    console.log(`\nTo apply: pnpm exec tsx scripts/clean-bad-reference-fills.ts --apply`);
    return;
  }

  // Wipe nutrition + ingredients_raw IF the latter was also injected by reference-fill.
  // Conservative: wipe only nutrition; keep whatever ingredients exist.
  let cleaned = 0;
  const CHUNK = 50;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    for (const t of chunk) {
      const { error } = await s
        .from("products")
        .update({ nutrition: null, updated_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) {
        console.warn(`fail ${t.id}: ${error.message}`);
      } else cleaned++;
    }
    console.log(`wiped ${cleaned}/${targets.length}`);
  }

  // Also delete their core_scores so they don't show stale scores
  const ids = targets.map(t => t.id);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const { error } = await s.from("core_scores").delete().in("product_id", chunk);
    if (error) console.warn(`score delete: ${error.message}`);
  }

  console.log(`\nDone. ${cleaned} products wiped. Their core_scores deleted (will rescore as no-nutrition).`);
  console.log("Next: pnpm score -- --force  (will skip them as no_nutrition until OCR or OFF backfill)");
}

main().catch(e => { console.error(e); process.exit(1); });

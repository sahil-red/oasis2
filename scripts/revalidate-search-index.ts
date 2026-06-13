#!/usr/bin/env -S pnpm tsx
/**
 * Zero-cost re-validation script — corrects product_search_index rows
 * using deterministic logic from the enrichment-validate + enrichment
 * pipeline changes. No LLM calls. No Voyage embeddings. Just regex +
 * arithmetic on data we already have.
 *
 *   pnpm tsx scripts/revalidate-search-index.ts
 *   pnpm tsx scripts/revalidate-search-index.ts -- --dry-run
 *   pnpm tsx scripts/revalidate-search-index.ts -- --limit=100
 *
 * Corrects:
 *   1. Dietary booleans   (is_vegan, is_gluten_free, has_added_sugar, is_palm_oil_free)
 *   2. Trait caps         (clean_label at 0.5 if ≥5 E-numbers, whole_food at 0.6 if ≥3)
 *   3. nova_group         (from ingredient text, not hardcoded null)
 *   4. no_artificial_sweetener trait (MATH, from ingredient text)
 *   5. Nutrition clamping (protein/sugar/fat 0-100, energy 0-900)
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { adminClient } from "@/lib/supabase/admin";
import { isArtificialSweetener } from "@/lib/search/ai-retrieval";

// Matches the regexes from enrichment-validate.ts
const ANIMAL_INGREDIENTS = /(?:^|,)\s*.*\b(?:milk|whey|casein|skimmed milk|cream|butter|ghee|paneer|egg|honey|gelatin|lactose)\b/i;
const GLUTEN_INGREDIENTS = /(?:^|,)\s*.*\b(?:wheat|barley|rye|maida|sooji|rava|atta|pasta|noodle|bread|biscuit|cookie|cracker|rusk)\b/i;
const ADDED_SUGAR_INGREDIENTS = /(?:^|,)\s*.*\b(?:sugar|cane sugar|brown sugar|jaggery|honey|maple syrup|glucose syrup|high fructose|corn syrup|golden syrup|molasses|date syrup|coconut sugar|invert sugar|maltose|dextrose|fructose)\b/i;
const PALM_INGREDIENTS = /(?:^|,)\s*.*\bpalm\b/i;
const E_NUMBER = /\b(?:e|ins)\s*\d{3,4}[a-z]?\b/gi;

type Correction = {
  product_id: string;
  fields: Record<string, unknown>;
};

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const limit = parseInt(argv.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "0", 10) || undefined;

  const sb = adminClient();
  const PAGE = 200; // smaller pages for faster startup
  let offset = 0;
  let corrected = 0;
  let skipped = 0;
  const stats = {
    is_vegan: 0, is_gluten_free: 0, has_added_sugar: 0, is_palm_oil_free: 0,
    clean_label: 0, whole_food: 0, nova_group: 0, no_artificial_sweetener: 0,
    sugar_g: 0, protein_g: 0, fat_g: 0, saturated_fat_g: 0, energy_kcal: 0,
  };

  console.log(dryRun ? "🔍 DRY RUN — no writes" : "✍️  LIVE — writing corrections");
  if (limit) console.log(`📏 Limit: ${limit} products\n`);

  while (true) {
    const { data: rows, error } = await sb
      .from("product_search_index")
      .select("product_id, name, brand, is_vegan, is_gluten_free, is_palm_oil_free, has_added_sugar, traits, trait_source, trait_confidence, sugar_g, protein_g, fat_g, saturated_fat_g, energy_kcal, nova_group, search_doc")
      .order("product_id")
      .range(offset, offset + PAGE - 1);

    if (error) { console.error("Fetch error:", error.message); break; }
    if (!rows?.length) break;

    const ids = rows.map(r => r.product_id);

    // Get ingredients_raw from products table
    const { data: products, error: prodErr } = await sb
      .from("products")
      .select("id, ingredients_raw")
      .in("id", ids);

    if (prodErr) { console.error("Products fetch error:", prodErr.message); break; }

    const ingMap = new Map((products ?? []).map(p => [p.id, p.ingredients_raw ?? ""]));

    const batch: Correction[] = [];

    for (const row of rows) {
      const ing = ingMap.get(row.product_id) ?? "";
      const fields: Record<string, unknown> = {};
      const traits = (row.traits ?? {}) as Record<string, number>;
      const traitConf = (row.trait_confidence ?? {}) as Record<string, number>;
      const traitSrc = (row.trait_source ?? {}) as Record<string, string>;

      // ── 1. Dietary booleans ──
      if (row.is_vegan && ing && ANIMAL_INGREDIENTS.test(ing)) {
        fields.is_vegan = false;
        stats.is_vegan++;
      }
      if (row.is_gluten_free && ing && GLUTEN_INGREDIENTS.test(ing) && !/\bgluten\s*free\b/i.test(ing)) {
        fields.is_gluten_free = false;
        stats.is_gluten_free++;
      }
      if (!row.has_added_sugar && ing && ADDED_SUGAR_INGREDIENTS.test(ing)) {
        fields.has_added_sugar = true;
        stats.has_added_sugar++;
      }
      if (row.is_palm_oil_free && ing && PALM_INGREDIENTS.test(ing)) {
        fields.is_palm_oil_free = false;
        stats.is_palm_oil_free++;
      }

      // ── 2. Trait caps ──
      const eCount = (ing.match(E_NUMBER) || []).length;
      const clValue = traits["clean_label"];
      if (eCount >= 5 && clValue != null && clValue > 0.5) {
        traits["clean_label"] = 0.5;
        traitConf["clean_label"] = Math.max(traitConf["clean_label"] ?? 0, 0.5);
        traitSrc["clean_label"] = "math";
        fields.traits = { ...traits };
        fields.trait_confidence = { ...traitConf };
        fields.trait_source = { ...traitSrc };
        stats.clean_label++;
      }
      const wfValue = traits["whole_food"];
      if (eCount >= 3 && wfValue != null && wfValue > 0.6) {
        traits["whole_food"] = 0.6;
        traitConf["whole_food"] = Math.max(traitConf["whole_food"] ?? 0, 0.5);
        traitSrc["whole_food"] = "math";
        fields.traits = { ...traits };
        fields.trait_confidence = { ...traitConf };
        fields.trait_source = { ...traitSrc };
        stats.whole_food++;
      }

      // ── 3. nova_group ──
      if (row.nova_group == null && ing.trim()) {
        const segCount = ing.split(/[,;]/).length;
        const nova = eCount > 0 ? 4 : segCount <= 2 ? 1 : segCount <= 5 ? 2 : 3;
        fields.nova_group = nova;
        stats.nova_group++;
      }

      // ── 4. no_artificial_sweetener trait ──
      if (traits["no_artificial_sweetener"] == null && ing) {
        traits["no_artificial_sweetener"] = isArtificialSweetener(ing) ? 0 : 1;
        traitSrc["no_artificial_sweetener"] = "math";
        traitConf["no_artificial_sweetener"] = row.data_quality_score ?? 0.5;
        fields.traits = { ...traits };
        fields.trait_source = { ...traitSrc };
        fields.trait_confidence = { ...traitConf };
        stats.no_artificial_sweetener++;
      }

      // ── 5. Nutrition clamping ──
      const clamp = (v: number | null, min: number, max: number) =>
        v != null ? Math.max(min, Math.min(max, v)) : null;

      const prevSugar = row.sugar_g;
      const prevProtein = row.protein_g;
      const prevFat = row.fat_g;
      const prevSatFat = row.saturated_fat_g;
      const prevKcal = row.energy_kcal;

      const newSugar = clamp(prevSugar, 0, 100);
      const newProtein = clamp(prevProtein, 0, 100);
      const newFat = clamp(prevFat, 0, 100);
      const newSatFat = clamp(prevSatFat, 0, 100);
      const newKcal = clamp(prevKcal, 0, 900);

      if (newSugar !== prevSugar) { fields.sugar_g = newSugar; stats.sugar_g++; }
      if (newProtein !== prevProtein) { fields.protein_g = newProtein; stats.protein_g++; }
      if (newFat !== prevFat) { fields.fat_g = newFat; stats.fat_g++; }
      if (newSatFat !== prevSatFat) { fields.saturated_fat_g = newSatFat; stats.saturated_fat_g++; }
      if (newKcal !== prevKcal) { fields.energy_kcal = newKcal; stats.energy_kcal++; }

      if (Object.keys(fields).length > 0) {
        corrected++;
        batch.push({ product_id: row.product_id, fields });
      } else {
        skipped++;
      }
    }

    // Write batch
    if (batch.length > 0 && !dryRun) {
      for (const c of batch) {
        const { error: upErr } = await sb
          .from("product_search_index")
          .update(c.fields)
          .eq("product_id", c.product_id);

        if (upErr) {
          console.error(`  FAIL ${c.product_id.slice(0,8)}: ${upErr.message}`);
        }
      }
    }

    offset += PAGE;
    console.log(`  Page ${Math.ceil(offset / PAGE)}: ${rowCount(offset, PAGE, rows.length)} rows, ${corrected} corrected, ${skipped} skipped`);

    if (limit && offset >= limit) break;
    if (rows.length < PAGE) break;
  }

  console.log(`\nDone. ${corrected} products corrected, ${skipped} unchanged.\n`);
  console.log("Correction counts:");
  for (const [key, count] of Object.entries(stats)) {
    if (count > 0) console.log(`  ${key}: ${count}`);
  }

  if (dryRun) console.log("\n⚠️  Dry run — no changes written. Remove --dry-run to apply.");
}

function rowCount(offset: number, page: number, len: number): string {
  return `${offset - page + 1}-${offset - page + len}`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

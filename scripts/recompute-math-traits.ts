#!/usr/bin/env -S pnpm tsx
/**
 * Recompute math traits using the FULL cohort (all products at once).
 * Fixes the chunked-cohort bug where products in small enrich chunks got
 * fewer math traits than products in large chunks of the same primary_type.
 *
 *   pnpm tsx scripts/recompute-math-traits.ts
 *   pnpm tsx scripts/recompute-math-traits.ts -- --dry-run
 *   pnpm tsx scripts/recompute-math-traits.ts -- --limit=500
 *
 * $0 cost — pure local compute, no API calls. No embeddings touched.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { adminClient } from "@/lib/supabase/admin";
import { applyQuantitativeTraits } from "@/lib/search/v2/enrichment";
import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

async function loadFullCohort(sb: ReturnType<typeof adminClient>, limit?: number): Promise<ProductSearchIndexRow[]> {
  const SLIM = "product_id,name,primary_type,sugar_g,protein_g,fat_g,saturated_fat_g,sodium_mg,energy_kcal,fiber_g,calcium_mg,iron_mg,carbs_g,traits,trait_source,trait_confidence,data_quality_score,has_added_sugar";
  const PAGE = 2000;
  let offset = 0;
  const rows: ProductSearchIndexRow[] = [];

  while (true) {
    const { data, error } = await sb
      .from("product_search_index")
      .select(SLIM)
      .range(offset, offset + PAGE - 1);

    if (error) { console.error("Fetch error:", error.message); break; }
    if (!data?.length) break;

    for (const r of data) rows.push(r as unknown as ProductSearchIndexRow);
    offset += PAGE;
    if (limit && rows.length >= limit) break;
  }
  return rows;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const limit = parseInt(argv.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "0", 10) || undefined;

  const sb = adminClient();

  console.log(dryRun ? "DRY RUN — no writes" : "LIVE — writing corrections");
  if (limit) console.log(`Limit: ${limit} products\n`);

  // Step 1: Load full cohort
  console.log("Loading full cohort...");
  const allRows = await loadFullCohort(sb, limit);
  console.log(`Loaded ${allRows.length} products.`);

  // Step 2: Compute math traits with full cohort
  console.log("Computing math traits with full cohort...");
  const correctedRows = applyQuantitativeTraits(allRows);

  // Step 3: Compare and upsert only changed rows
  console.log("Comparing and updating...\n");
  let updated = 0, noChange = 0;
  const improvements: { type: string; before: number; after: number; example: string }[] = [];

  for (let i = 0; i < correctedRows.length; i++) {
    const oldRow = allRows[i]!;
    const newRow = correctedRows[i]!;

    const oldMathCount = Object.values(oldRow.trait_source ?? {}).filter(v => v === "math").length;
    const newMathCount = Object.values(newRow.trait_source ?? {}).filter(v => v === "math").length;

    // Quick check: any values actually changed?
    let changed = newMathCount !== oldMathCount;
    if (!changed) {
      const oldTraits = oldRow.traits as Record<string, number> | null;
      const newTraits = newRow.traits as Record<string, number> | null;
      for (const [k, v] of Object.entries(newTraits ?? {})) {
        if ((oldTraits?.[k] ?? null) !== v) { changed = true; break; }
      }
    }

    if (!changed) { noChange++; continue; }

    updated++;
    if (newMathCount > oldMathCount && newMathCount - oldMathCount >= 3) {
      improvements.push({
        type: oldRow.primary_type ?? "?",
        before: oldMathCount,
        after: newMathCount,
        example: oldRow.name?.slice(0,50) ?? "?",
      });
    }

    if (!dryRun) {
      const { error } = await sb
        .from("product_search_index")
        .update({
          traits: newRow.traits,
          trait_source: newRow.trait_source,
          trait_confidence: newRow.trait_confidence,
        })
        .eq("product_id", newRow.product_id);

      if (error) console.error(`  FAIL ${newRow.product_id.slice(0,8)}: ${error.message}`);
    }

    if (updated % 1000 === 0) console.log(`  Updated ${updated}, no change ${noChange}...`);
  }

  console.log(`\nDone. ${updated} updated, ${noChange} unchanged.`);
  console.log(`Types with ≥3 new math traits: ${new Set(improvements.map(i => i.type)).size}`);
  for (const imp of improvements.slice(0, 15)) {
    console.log(`  ${imp.before}→${imp.after} | ${imp.type}: ${imp.example}`);
  }

  if (dryRun) console.log("\nDry run — no changes written. Remove --dry-run to apply.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

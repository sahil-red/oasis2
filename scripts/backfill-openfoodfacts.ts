#!/usr/bin/env -S pnpm tsx
/**
 * Backfill nutrition + ingredients from OpenFoodFacts (free, no API key).
 *
 * Targets products with sparse/missing nutrition, in priority order:
 *   1. Has barcode → exact lookup
 *   2. Brand + name → fuzzy search (only if confidence ≥ 0.6)
 *
 *   pnpm exec tsx scripts/backfill-openfoodfacts.ts -- --limit=100        # test run
 *   pnpm exec tsx scripts/backfill-openfoodfacts.ts -- --limit=100 --dry-run
 *   pnpm exec tsx scripts/backfill-openfoodfacts.ts -- --all              # full pass
 */
import { config } from "dotenv"; config({ path: ".env.local" });
import { adminClient } from "@/lib/supabase/admin";
import { offLookup, offToProductNutrition, offIngredients } from "@/lib/nutrition/openfoodfacts";

interface Args { limit: number | null; dryRun: boolean; onlyBarcode: boolean; }

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const limitArg = argv.find(a => a.startsWith("--limit="));
  return {
    limit: argv.includes("--all") ? null : (limitArg ? Number(limitArg.split("=")[1]) : 50),
    dryRun: argv.includes("--dry-run"),
    onlyBarcode: argv.includes("--only-barcode"),
  };
}

async function main() {
  const args = parseArgs();
  console.log(`[off-backfill] limit=${args.limit ?? "all"} dry_run=${args.dryRun} only_barcode=${args.onlyBarcode}`);
  const s = adminClient();

  // Fetch products with no nutrition (or sparse nutrition) + ideally a barcode
  const { data, error } = await s
    .from("products")
    .select("id, name, brand, barcode, nutrition, ingredients_raw, category")
    .eq("platform", "zepto")
    .is("nutrition", null)
    .limit(args.limit ?? 5000);
  if (error) throw error;
  const targets = (data ?? []).filter(r => args.onlyBarcode ? Boolean(r.barcode) : true);
  console.log(`[off-backfill] candidates: ${targets.length} (with_barcode: ${targets.filter(r => r.barcode).length})`);

  let matched = 0, written = 0, missing = 0, errors = 0;
  const RPS_DELAY_MS = 110; // ~9 req/sec polite

  for (const [i, row] of targets.entries()) {
    try {
      const match = await offLookup({
        barcode: row.barcode as string | null,
        name: row.name as string,
        brand: row.brand as string | null,
      });
      await new Promise(r => setTimeout(r, RPS_DELAY_MS));
      if (!match) { missing++; continue; }
      matched++;

      const nutrition = offToProductNutrition(match.off);
      const ingredients = offIngredients(match.off);
      if (!nutrition && !ingredients) { missing++; continue; }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (nutrition) patch.nutrition = nutrition;
      if (ingredients && !row.ingredients_raw) patch.ingredients_raw = ingredients;

      console.log(`  ✓ ${row.name?.slice(0, 50)} → OFF "${match.off.product_name?.slice(0, 40)}" (conf=${match.confidence.toFixed(2)}, ${match.match_type})`);

      if (!args.dryRun) {
        const { error: upErr } = await s.from("products").update(patch).eq("id", row.id);
        if (upErr) { errors++; console.warn(`    update fail: ${upErr.message}`); continue; }
        written++;
      }

      if ((i + 1) % 25 === 0) console.log(`  [${i + 1}/${targets.length}] matched=${matched} written=${written} missing=${missing}`);
    } catch (e) {
      errors++;
      if (errors <= 5) console.warn(`  err ${row.name?.slice(0, 40)}: ${(e as Error).message}`);
    }
  }

  console.log(`\n[off-backfill] done. matched=${matched}/${targets.length} written=${written} missing=${missing} errors=${errors}`);
  console.log(`Next: pnpm score -- --force  (rescore the newly-filled products)`);
}

main().catch(e => { console.error(e); process.exit(1); });

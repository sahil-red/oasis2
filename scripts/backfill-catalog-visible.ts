/**
 * Backfill products.catalog_visible from TS eligibility rules.
 * Run after applying migration 0006_catalog_performance.sql:
 *   pnpm tsx scripts/backfill-catalog-visible.ts
 */
import { computeCatalogVisible } from "@/lib/products/catalog-eligibility";
import { adminClient } from "@/lib/supabase/admin";

const PAGE = 500;

async function main() {
  const supabase = adminClient();
  let offset = 0;
  let updated = 0;
  let scanned = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, platform, zepto_sku, name, super_category, category, subcategory, ingredients_raw, nutrition, catalog_visible",
      )
      .eq("platform", "zepto")
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    const patches: { id: string; catalog_visible: boolean }[] = [];
    for (const row of data) {
      scanned++;
      const next = computeCatalogVisible({
        platform: row.platform,
        zepto_sku: row.zepto_sku,
        name: row.name,
        super_category: row.super_category,
        category: row.category,
        subcategory: row.subcategory,
        ingredients_raw: row.ingredients_raw,
        nutrition: row.nutrition,
      });
      if (next !== row.catalog_visible) {
        patches.push({ id: row.id, catalog_visible: next });
      }
    }

    for (let i = 0; i < patches.length; i += 100) {
      const chunk = patches.slice(i, i + 100);
      const { error: upErr } = await supabase.from("products").upsert(chunk);
      if (upErr) throw new Error(upErr.message);
      updated += chunk.length;
    }

    if (data.length < PAGE) break;
    offset += PAGE;
    if (scanned % 2000 === 0) {
      console.log(`[backfill-catalog-visible] scanned=${scanned} updated=${updated}`);
    }
  }

  console.log(`[backfill-catalog-visible] done scanned=${scanned} updated=${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

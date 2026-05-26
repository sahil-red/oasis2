/**
 * Backfill products.catalog_visible from TS eligibility rules.
 * Run after applying migration 0006_catalog_performance.sql:
 *   pnpm catalog:backfill-visible
 */
import { config as loadEnv } from "dotenv";
import { computeCatalogVisible } from "@/lib/products/catalog-eligibility";
import { adminClient } from "@/lib/supabase/admin";

loadEnv({ path: ".env.local" });

const PAGE = 500;

async function main() {
  const supabase = adminClient();

  const { error: probeErr } = await supabase.from("products").select("catalog_visible").limit(0);
  if (probeErr?.message.includes("catalog_visible")) {
    console.error(
      "[backfill-catalog-visible] Missing column products.catalog_visible.\n" +
        "Run migration first: paste supabase/migrations/0006_catalog_performance.sql in Supabase SQL Editor, then retry.",
    );
    process.exit(1);
  }

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

    if (patches.length) {
      const toTrue = patches.filter((p) => p.catalog_visible).map((p) => p.id);
      const toFalse = patches.filter((p) => !p.catalog_visible).map((p) => p.id);

      if (toTrue.length) {
        const { error: upErr } = await supabase
          .from("products")
          .update({ catalog_visible: true })
          .in("id", toTrue);
        if (upErr) throw new Error(upErr.message);
      }
      if (toFalse.length) {
        const { error: upErr } = await supabase
          .from("products")
          .update({ catalog_visible: false })
          .in("id", toFalse);
        if (upErr) throw new Error(upErr.message);
      }
      updated += patches.length;
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

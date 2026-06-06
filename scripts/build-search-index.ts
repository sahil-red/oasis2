#!/usr/bin/env -S pnpm tsx
/**
 * Build Search V2 offline index from catalog products.
 *
 *   pnpm search:build-index
 *   pnpm search:build-index -- --limit=500
 *   pnpm search:build-index -- --dry-run
 */

import { config } from "dotenv";
import { isCatalogVisible } from "@/lib/products/catalog-eligibility";
import { adminClient } from "@/lib/supabase/admin";
import { buildCategoryTraitProfiles } from "@/lib/search/v2/category-profiles";
import { enrichProductToIndexRow, finalizeIndexBatch } from "@/lib/search/v2/enrichment";

config({ path: ".env.local" });

function parseArgs() {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
  }
  return { limit, dryRun: argv.includes("--dry-run") };
}

async function main() {
  const args = parseArgs();
  const supabase = adminClient();
  const batchSize = 500;
  let offset = 0;
  const allRows: ReturnType<typeof enrichProductToIndexRow>[] = [];

  console.log("[search:build-index] loading products…");

  for (;;) {
    let q = supabase
      .from("products")
      .select(
        "id, slug, name, brand, category, subcategory, l3_category, net_weight, price_inr, mrp_inr, nutrition, ingredients_raw, attributes, core_scores ( score, subscores )",
      )
      .eq("platform", "zepto")
      .not("nutrition", "is", null)
      .range(offset, offset + batchSize - 1);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).filter((p) =>
      isCatalogVisible({
        name: p.name,
        category: p.category,
        subcategory: p.subcategory,
        ingredients_raw: p.ingredients_raw,
        nutrition: p.nutrition,
      }),
    );
    for (const p of rows) {
      const scores = Array.isArray(p.core_scores) ? p.core_scores[0] : p.core_scores;
      allRows.push(
        enrichProductToIndexRow({
          id: p.id,
          slug: p.slug,
          name: p.name,
          brand: p.brand,
          category: p.category,
          subcategory: p.subcategory,
          l3_category: p.l3_category,
          net_weight: p.net_weight,
          price_inr: p.price_inr,
          mrp_inr: p.mrp_inr,
          nutrition: p.nutrition,
          ingredients_raw: p.ingredients_raw,
          attributes: p.attributes,
          core_scores: scores ?? null,
        }),
      );
    }
    offset += batchSize;
    if (!data?.length || data.length < batchSize) break;
    if (args.limit && allRows.length >= args.limit) break;
    console.log(`[search:build-index] loaded ${allRows.length}…`);
  }

  const capped = args.limit ? allRows.slice(0, args.limit) : allRows;
  const finalized = finalizeIndexBatch(capped);
  const profiles = buildCategoryTraitProfiles(finalized);

  console.log(`[search:build-index] ${finalized.length} index rows, ${profiles.length} category profiles`);

  if (args.dryRun) {
    console.log("[search:build-index] dry-run — no DB writes");
    return;
  }

  const upsertBatch = 100;
  for (let i = 0; i < finalized.length; i += upsertBatch) {
    const chunk = finalized.slice(i, i + upsertBatch).map((row) => ({
      ...row,
      traits: row.traits,
      trait_source: row.trait_source,
      trait_confidence: row.trait_confidence,
      facet_confidence: row.facet_confidence,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("product_search_index").upsert(chunk, { onConflict: "product_id" });
    if (error) {
      console.error("[search:build-index] upsert failed:", error.message);
      console.error("Apply migration: pnpm db:migrate (0013_search_v2.sql)");
      process.exit(1);
    }
    console.log(`[search:build-index] upserted ${Math.min(i + upsertBatch, finalized.length)}/${finalized.length}`);
  }

  for (const profile of profiles) {
    const { error } = await supabase.from("category_trait_profile").upsert(
      { ...profile, rebuilt_at: new Date().toISOString() },
      { onConflict: "category_key" },
    );
    if (error) {
      console.error("[search:build-index] profile upsert failed:", error.message);
      process.exit(1);
    }
  }

  console.log("[search:build-index] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

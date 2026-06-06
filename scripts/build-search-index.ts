#!/usr/bin/env -S pnpm tsx
/**
 * Build Search V2 offline index — L1 LLM enrichment + math + embeddings (§16.1).
 *
 *   pnpm search:build-index
 *   pnpm search:build-index -- --limit=500
 *   pnpm search:build-index -- --dry-run
 *   pnpm search:build-index -- --no-llm
 */

import { config } from "dotenv";
import { isCatalogVisible } from "@/lib/products/catalog-eligibility";
import { adminClient } from "@/lib/supabase/admin";
import { buildCategoryTraitProfiles } from "@/lib/search/v2/category-profiles";
import { buildIndexFromProducts, type EnrichSource } from "@/lib/search/v2/enrichment";
import { embedText } from "@/lib/search/v2/embeddings";
import { SEED_GOAL_TRAIT_MAP } from "@/lib/search/v2/goal-graph";

config({ path: ".env.local" });

function parseArgs() {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
  }
  return { limit, dryRun: argv.includes("--dry-run"), noLlm: argv.includes("--no-llm") };
}

async function main() {
  const args = parseArgs();
  const supabase = adminClient();
  const batchSize = 500;
  let offset = 0;
  const products: EnrichSource[] = [];

  console.log("[search:build-index] loading products…");

  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, slug, name, brand, category, subcategory, l3_category, net_weight, price_inr, mrp_inr, nutrition, ingredients_raw, attributes, core_scores ( score, subscores )",
      )
      .eq("platform", "zepto")
      .not("nutrition", "is", null)
      .range(offset, offset + batchSize - 1);

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
      products.push({
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
      });
    }

    offset += batchSize;
    if (!data?.length || data.length < batchSize) break;
    if (args.limit && products.length >= args.limit) break;
    console.log(`[search:build-index] loaded ${products.length}…`);
  }

  const capped = args.limit ? products.slice(0, args.limit) : products;
  const finalized = await buildIndexFromProducts(capped, { useLlm: !args.noLlm });
  const profiles = await buildCategoryTraitProfiles(finalized);

  console.log(
    `[search:build-index] ${finalized.length} index rows, ${profiles.length} category profiles (llm=${!args.noLlm})`,
  );

  if (args.dryRun) {
    console.log("[search:build-index] dry-run — no DB writes");
    return;
  }

  const upsertBatch = 50;
  for (let i = 0; i < finalized.length; i += upsertBatch) {
    const chunk = finalized.slice(i, i + upsertBatch).map((row) => ({
      ...row,
      embedding: row.embedding,
      type_embedding: row.type_embedding,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from("product_search_index").upsert(chunk, {
      onConflict: "product_id",
    });
    if (error) {
      console.error("[search:build-index] upsert failed:", error.message);
      console.error("Apply migrations: pnpm db:migrate");
      process.exit(1);
    }
    console.log(
      `[search:build-index] upserted ${Math.min(i + upsertBatch, finalized.length)}/${finalized.length}`,
    );
  }

  for (const profile of profiles) {
    const { error } = await supabase.from("category_trait_profile").upsert(
      {
        ...profile,
        trait_centroid: profile.trait_centroid,
        rebuilt_at: new Date().toISOString(),
      },
      { onConflict: "category_key" },
    );
    if (error) {
      console.error("[search:build-index] profile upsert failed:", error.message);
      process.exit(1);
    }
  }

  for (const seed of SEED_GOAL_TRAIT_MAP) {
    const goal_embedding = await embedText(seed.goal_phrase);
    await supabase.from("goal_trait_map").upsert(
      {
        goal_id: seed.goal_id,
        goal_phrase: seed.goal_phrase,
        display_name: seed.display_name,
        trait_weights: seed.trait_weights,
        goal_embedding: goal_embedding.length ? goal_embedding : null,
        source: seed.source,
        confidence: seed.confidence,
        support_count: seed.support_count,
      },
      { onConflict: "goal_id" },
    );
  }

  console.log("[search:build-index] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

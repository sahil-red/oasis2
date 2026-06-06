#!/usr/bin/env -S pnpm tsx
/**
 * Build Search V2 offline index — L1 LLM enrichment + math + embeddings (§16.1).
 *
 *   pnpm search:build-index
 *   pnpm search:build-index -- --limit=500
 *   pnpm search:build-index -- --category=Snacks
 *   pnpm search:build-index -- --subcategory=Biscuits
 *   pnpm search:build-index -- --skip-unchanged
 *   pnpm search:build-index -- --dry-run
 *   pnpm search:build-index -- --no-llm
 */

import { config } from "dotenv";
import { isCatalogVisible } from "@/lib/products/catalog-eligibility";
import { adminClient } from "@/lib/supabase/admin";
import { assignCanonicalClusters } from "@/lib/search/v2/canonical-cluster";
import { buildCategoryTraitProfiles } from "@/lib/search/v2/category-profiles";
import { buildIndexFromProducts, type EnrichSource } from "@/lib/search/v2/enrichment";
import { embedText } from "@/lib/search/v2/embeddings";
import { SEED_GOAL_TRAIT_MAP } from "@/lib/search/v2/goal-graph";
import { computeProductSourceHash } from "@/lib/search/v2/source-hash";

config({ path: ".env.local" });

function parseArgs() {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  let category: string | null = null;
  let subcategory: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
    if (a.startsWith("--category=")) category = a.split("=")[1] ?? null;
    if (a.startsWith("--subcategory=")) subcategory = a.split("=")[1] ?? null;
  }
  return {
    limit,
    category,
    subcategory,
    dryRun: argv.includes("--dry-run"),
    noLlm: argv.includes("--no-llm"),
    skipUnchanged: argv.includes("--skip-unchanged"),
  };
}

async function loadExistingHashes(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const supabase = adminClient();
    // Paginate — PostgREST caps a single select at ~1000 rows; without this,
    // --skip-unchanged would re-enrich every product past row 1000 on each run.
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("product_search_index")
        .select("product_id, source_hash")
        .range(from, from + PAGE - 1);
      if (error) break;
      for (const row of data ?? []) {
        if (row.source_hash) map.set(String(row.product_id), String(row.source_hash));
      }
      if (!data || data.length < PAGE) break;
    }
  } catch {
    // table may not exist yet
  }
  return map;
}

async function main() {
  const args = parseArgs();
  const supabase = adminClient();
  const enrichChunk = 100;
  const loadBatch = 500;
  let offset = 0;
  const allFinalized: Awaited<ReturnType<typeof buildIndexFromProducts>> = [];
  const existingHashes = args.skipUnchanged ? await loadExistingHashes() : new Map<string, string>();

  console.log("[search:build-index] loading products…", {
    category: args.category,
    subcategory: args.subcategory,
    skipUnchanged: args.skipUnchanged,
  });

  for (;;) {
    let query = supabase
      .from("products")
      .select(
        "id, slug, name, brand, super_category, category, subcategory, l3_category, net_weight, price_inr, mrp_inr, nutrition, ingredients_raw, attributes, core_scores ( score, subscores )",
      )
      .eq("platform", "zepto")
      .not("nutrition", "is", null);

    if (args.category) query = query.eq("category", args.category);
    if (args.subcategory) query = query.eq("subcategory", args.subcategory);

    const { data, error } = await query.range(offset, offset + loadBatch - 1);
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

    const chunkProducts: EnrichSource[] = [];
    for (const p of rows) {
      const scores = Array.isArray(p.core_scores) ? p.core_scores[0] : p.core_scores;
      const source = {
        id: p.id,
        slug: p.slug,
        name: p.name,
        brand: p.brand,
        super_category: p.super_category,
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
      };
      const hash = computeProductSourceHash({
        name: source.name,
        brand: source.brand,
        category: source.category,
        subcategory: source.subcategory,
        l3_category: source.l3_category ?? null,
        nutrition: source.nutrition,
        ingredients_raw: source.ingredients_raw,
        attributes: source.attributes,
      });
      if (args.skipUnchanged && existingHashes.get(source.id) === hash) continue;
      chunkProducts.push(source);
    }

    for (let i = 0; i < chunkProducts.length; i += enrichChunk) {
      if (args.limit && allFinalized.length >= args.limit) break;

      const room = args.limit ? args.limit - allFinalized.length : enrichChunk;
      const slice = chunkProducts.slice(i, i + Math.min(enrichChunk, room));
      if (!slice.length) continue;

      console.log(`[search:build-index] enriching ${slice.length} products…`);
      const finalized = await buildIndexFromProducts(slice, { useLlm: !args.noLlm });
      allFinalized.push(...finalized);

      if (!args.dryRun) {
        const { error: upsertErr } = await supabase.from("product_search_index").upsert(
          finalized.map((row) => ({
            ...row,
            embedding: row.embedding,
            type_embedding: row.type_embedding,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "product_id" },
        );
        if (upsertErr) {
          console.error("[search:build-index] upsert failed:", upsertErr.message);
          console.error("Apply migrations: pnpm db:migrate");
          process.exit(1);
        }
        console.log(`[search:build-index] upserted ${allFinalized.length} rows total`);
      }

      if (args.limit && allFinalized.length >= args.limit) break;
    }

    offset += loadBatch;
    if (!data?.length || data.length < loadBatch) break;
    if (args.limit && allFinalized.length >= args.limit) break;
  }

  let capped = args.limit ? allFinalized.slice(0, args.limit) : allFinalized;

  if (capped.length) {
    console.log(`[search:build-index] global canonical clustering (${capped.length} rows)…`);
    capped = await assignCanonicalClusters(capped);

    if (!args.dryRun) {
      const clusterChunk = 200;
      for (let i = 0; i < capped.length; i += clusterChunk) {
        const slice = capped.slice(i, i + clusterChunk);
        const { error: clusterErr } = await supabase.from("product_search_index").upsert(
          slice.map((row) => ({
            ...row,
            embedding: row.embedding,
            type_embedding: row.type_embedding,
            canonical_product_id: row.canonical_product_id,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "product_id" },
        );
        if (clusterErr) {
          console.error("[search:build-index] canonical upsert failed:", clusterErr.message);
          process.exit(1);
        }
      }
      console.log(`[search:build-index] canonical_product_id updated for ${capped.length} rows`);
    }
  }

  const profiles = capped.length ? await buildCategoryTraitProfiles(capped) : [];

  console.log(
    `[search:build-index] ${capped.length} enriched rows, ${profiles.length} category profiles (llm=${!args.noLlm})`,
  );

  if (args.dryRun) {
    console.log("[search:build-index] dry-run — skipped profile/goal writes");
    return;
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
    const goal_embedding = await embedText(seed.goal_phrase, "document");
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

  const { clearSearchIndexSnapshotCache } = await import("@/lib/search/v2/index-queries");
  clearSearchIndexSnapshotCache();
  console.log("[search:build-index] done (snapshot cache cleared)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

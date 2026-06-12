#!/usr/bin/env -S pnpm tsx
/**
 * Build Search V2 offline index — L1 LLM enrichment + math + embeddings (§16.1).
 *
 *   pnpm search:build-index
 *   pnpm search:build-index -- --limit=500
 *   pnpm search:build-index -- --category=Snacks
 *   pnpm search:build-index -- --subcategory=Biscuits
 *   pnpm search:build-index -- --skip-unchanged
 *   pnpm search:build-index -- --skip-existing
 *   pnpm search:build-index -- --dry-run
 *   pnpm search:build-index -- --no-llm
 */

import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { assignCanonicalClusters } from "@/lib/search/v2/canonical-cluster";
import { buildCategoryTraitProfiles } from "@/lib/search/v2/category-profiles";
import { buildIndexFromProducts, type EnrichSource } from "@/lib/search/v2/enrichment";
import { embedText } from "@/lib/search/v2/embeddings";
import { SEED_GOAL_TRAIT_MAP } from "@/lib/search/v2/goal-graph";
import { computeProductSourceHash } from "@/lib/search/v2/source-hash";
import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

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
    skipExisting: argv.includes("--skip-existing"),
  };
}

async function loadExistingIds(st: ReturnType<typeof adminClient>): Promise<Set<string>> {
  const set = new Set<string>();
  for (let page = 0; page < 200; page++) {
    const { data, error } = await st
      .from("product_search_index")
      .select("product_id")
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data?.length) break;
    for (const r of data) set.add(r.product_id);
  }
  return set;
}

async function loadExistingHashes(st: ReturnType<typeof adminClient>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let page = 0; page < 200; page++) {
    const { data, error } = await st
      .from("product_search_index")
      .select("product_id, source_hash")
      .not("source_hash", "is", null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !data?.length) break;
    for (const r of data) {
      if (r.source_hash) map.set(r.product_id, r.source_hash);
    }
  }
  return map;
}

async function upsertBatch(st: ReturnType<typeof adminClient>, rows: ProductSearchIndexRow[]): Promise<void> {
  const BATCH = 5;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await st.from("product_search_index").upsert(
      slice.map(({ type_embedding, ...row }) => ({
        ...row,
        embedding: row.embedding,
        canonical_product_id: row.canonical_product_id ?? row.product_id,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "product_id" },
    );
    if (error) throw new Error(`upsert failed: ${error.message}`);
  }
}

async function main() {
  const args = parseArgs();
  const st = adminClient();

  const enrichChunk = 1000;
  const allFinalized: Awaited<ReturnType<typeof buildIndexFromProducts>> = [];

  const existingIds = args.skipExisting ? await loadExistingIds(st) : new Set<string>();
  const existingHashes = args.skipUnchanged ? await loadExistingHashes(st) : new Map<string, string>();

  console.log("[search:build-index] loading products…", {
    category: args.category,
    subcategory: args.subcategory,
    skipUnchanged: args.skipUnchanged,
    skipExisting: args.skipExisting,
    existingIds: existingIds.size,
  });

  // Paginate products via Supabase REST API (max 1000 per page)
  const allCandidates: EnrichSource[] = [];
  for (let page = 0; page < 50; page++) {
    let query = st
      .from("products")
      .select("id,slug,name,brand,super_category,category,subcategory,l3_category,net_weight,price_inr,mrp_inr,nutrition,ingredients_raw,attributes,core_scores(score)")
      .eq("platform", "zepto")
      .range(page * 1000, (page + 1) * 1000 - 1);

    if (args.category) query = query.eq("category", args.category);
    if (args.subcategory) query = query.eq("subcategory", args.subcategory);

    const { data, error } = await query;
    if (error) throw new Error(`products query failed: ${error.message}`);
    if (!data?.length) break;

    for (const p of data) {
      const rawScore = p.core_scores as
        | { score: number }
        | { score: number }[]
        | null
        | undefined;
      const scoreRow = Array.isArray(rawScore) ? rawScore[0] : rawScore;
      const source = {
        id: p.id as string,
        slug: p.slug as string,
        name: p.name as string,
        brand: p.brand as string | null,
        super_category: p.super_category as string | null,
        category: p.category as string | null,
        subcategory: p.subcategory as string | null,
        l3_category: p.l3_category as string | null,
        net_weight: p.net_weight as string | null,
        price_inr: p.price_inr as number | null,
        mrp_inr: p.mrp_inr as number | null,
        nutrition: p.nutrition as Record<string, unknown> | null,
        ingredients_raw: p.ingredients_raw as string | null,
        attributes: p.attributes as Record<string, string> | null,
        core_scores: scoreRow ?? null,
      };
      const hash = computeProductSourceHash({
        name: source.name,
        brand: source.brand,
        category: source.category,
        subcategory: source.subcategory,
        l3_category: source.l3_category ?? null,
        net_weight: source.net_weight ?? null,
        nutrition: source.nutrition,
        ingredients_raw: source.ingredients_raw,
        attributes: source.attributes,
      });
      if (args.skipExisting && existingIds.has(source.id)) continue;
      if (args.skipUnchanged && existingHashes.get(source.id) === hash) continue;
      allCandidates.push(source as EnrichSource);
    }
  }

  console.log(`[search:build-index] ${allCandidates.length} candidates after filters`);

  // Process in enrichment chunks
  for (let i = 0; i < allCandidates.length; i += enrichChunk) {
    if (args.limit && allFinalized.length >= args.limit) break;

    const room = args.limit ? args.limit - allFinalized.length : enrichChunk;
    const slice = allCandidates.slice(i, i + Math.min(enrichChunk, room));
    if (!slice.length) continue;

    console.log(`[search:build-index] enriching ${slice.length}/${allCandidates.length} products…`);
    const finalized = await buildIndexFromProducts(slice, { useLlm: !args.noLlm });
    allFinalized.push(...finalized);

    if (!args.dryRun) {
      await upsertBatch(st, finalized);
      console.log(`[search:build-index] upserted ${allFinalized.length} rows total`);
    }
  }

  let capped = args.limit ? allFinalized.slice(0, args.limit) : allFinalized;

  if (capped.length) {
    console.log(`[search:build-index] global canonical clustering (${capped.length} rows)…`);
    capped = await assignCanonicalClusters(capped);

    if (!args.dryRun) {
      // Update canonical_product_id via upsert
      for (let i = 0; i < capped.length; i += 5) {
        const slice = capped.slice(i, i + 5);
        const { error } = await st.from("product_search_index").upsert(
          slice.map((row) => ({
            product_id: row.product_id,
            slug: row.slug,
            name: row.name,
            canonical_product_id: row.canonical_product_id,
            data_quality_score: row.data_quality_score,
            data_completeness: row.data_completeness,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "product_id" },
        );
        if (error) {
          console.error("[search:build-index] canonical upsert failed:", error.message);
          process.exit(1);
        }
      }
      console.log(`[search:build-index] canonical_product_id updated for ${capped.length} rows`);
    }
  }

  // Refresh type centroids (avg embedding per primary_type) — powers semantic
  // type equivalents/neighbors at query time. ~18s in-DB; needs the direct
  // connection (PostgREST statement timeout is too short for this).
  if (!args.dryRun) {
    if (process.env.SUPABASE_DB_URL) {
      try {
        const { default: postgres } = await import("postgres");
        const sqlc = postgres(process.env.SUPABASE_DB_URL, { max: 1 });
        try {
          await sqlc.unsafe("SET statement_timeout = '120s'");
          const r = await sqlc.unsafe("SELECT refresh_type_centroids(2) AS n");
          console.log(`[search:build-index] type centroids refreshed (${r[0]?.n} types)`);
        } finally {
          await sqlc.end({ timeout: 5 });
        }
      } catch (e) {
        console.warn(
          "[search:build-index] centroid refresh failed — run `SELECT refresh_type_centroids(2)` manually:",
          (e as Error).message,
        );
      }
    } else {
      console.warn(
        "[search:build-index] SUPABASE_DB_URL unset — run `SELECT refresh_type_centroids(2)` in SQL editor after this build",
      );
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
    const { error } = await st.from("category_trait_profile").upsert(
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
    await st.from("goal_trait_map").upsert(
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

  // Persist facets to summary table (replaces slow search_v2_facets RPC)
  try {
    const { data: facets } = await st.rpc("search_v2_facets");
    const f = facets as { brands?: string[]; primary_types?: string[] };
      if (f?.brands?.length) {
      await st.from("catalog_facets").upsert(
        {
          id: 1,
          brands: f.brands,
          primary_types: f.primary_types ?? [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      // Also write static JSON (0ms runtime import, no DB call)
      const { writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      writeFileSync(
        join(process.cwd(), "data/catalog-facets.json"),
        JSON.stringify({
          brands: (f.brands ?? []).map((b: string) => b.toLowerCase()),
          primary_types: (f.primary_types ?? []).map((t: string) => t.toLowerCase()),
          built_at: new Date().toISOString(),
        }),
      );
      console.log("[search:build-index] catalog_facets cached + static JSON written");
    }
  } catch (e) {
    console.warn("[search:build-index] catalog_facets cache failed:", (e as Error).message);
  }

  const { clearSearchIndexSnapshotCache } = await import("@/lib/search/v2/index-queries");
  clearSearchIndexSnapshotCache();
  console.log("[search:build-index] done (snapshot cache cleared)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

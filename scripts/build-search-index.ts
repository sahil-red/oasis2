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
import postgres from "postgres";
import type { Sql } from "postgres";
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

function esc(s: string | null | undefined): string {
  if (s == null) return "NULL";
  return "'" + s.replace(/'/g, "''") + "'";
}

function escNum(n: number | null | undefined): string {
  return n == null ? "NULL" : String(n);
}

function escBool(b: boolean | null | undefined): string {
  return b == null ? "NULL" : b ? "TRUE" : "FALSE";
}

function escJson(obj: unknown): string {
  return "'" + JSON.stringify(obj ?? {}).replace(/'/g, "''") + "'::jsonb";
}

function escVec(v: number[] | null): string {
  if (!v || !v.length) return "NULL";
  return "'[" + v.join(",") + "]'::vector";
}

function escArr(arr: string[] | null): string {
  if (!arr || !arr.length) return "'{}'::text[]";
  return "ARRAY[" + arr.map(s => "'" + s.replace(/'/g, "''") + "'").join(",") + "]::text[]";
}

async function upsertIndexRows(sql: Sql, rows: ProductSearchIndexRow[]): Promise<void> {
  if (!rows.length) return;
  const now = new Date().toISOString();
  const vals = rows.map(r =>
    `(${esc(r.product_id)}::uuid,${esc(r.canonical_product_id)}::uuid,${esc(r.slug)},${esc(r.name)},${esc(r.brand)},${esc(r.category)},${esc(r.subcategory)},${esc(r.l3_category)},${esc(r.primary_type)},${esc(r.base_name)},${esc(r.form)},${escArr(r.flavours)},${escArr(r.variants)},${escBool(r.is_veg)},${escBool(r.is_vegan)},${escBool(r.is_gluten_free)},${escBool(r.is_jain)},${escBool(r.is_palm_oil_free)},${escBool(r.has_added_sugar)},${escArr(r.allergens)},${escArr(r.claims)},${escNum(r.sugar_g)},${escNum(r.protein_g)},${escNum(r.fat_g)},${escNum(r.saturated_fat_g)},${escNum(r.sodium_mg)},${escNum(r.energy_kcal)},${escNum(r.calcium_mg)},${escNum(r.iron_mg)},${escNum(r.fiber_g)},${escNum(r.carbs_g)},${escNum(r.price_inr)},${esc(r.sugar_tier)},${esc(r.protein_tier)},${esc(r.fat_tier)},${escJson(r.traits)},${escJson(r.trait_source)},${escJson(r.trait_confidence)},${escJson(r.trait_reasons)},${escNum(r.scout_score)},${escNum(r.nova_group)},${escNum(r.data_quality_score)},${escNum(r.data_completeness)},${escJson(r.facet_confidence)},${esc(r.brand_tier)},${escNum(r.pack_size_value)},${esc(r.pack_size_unit)},${escArr(r.use_cases)},${esc(r.search_doc)},${escVec(r.embedding)},${escVec(r.type_embedding)},${escNum(r.click_count)},${escNum(r.save_count)},${esc(r.last_interaction_at)},${esc(r.built_at)},${esc(r.source_hash)},${esc(now)})`
  ).join(",\n");

  await sql.unsafe(`
    INSERT INTO product_search_index (
      product_id, canonical_product_id, slug, name, brand, category, subcategory, l3_category,
      primary_type, base_name, form, flavours, variants,
      is_veg, is_vegan, is_gluten_free, is_jain, is_palm_oil_free, has_added_sugar,
      allergens, claims,
      sugar_g, protein_g, fat_g, saturated_fat_g, sodium_mg, energy_kcal,
      calcium_mg, iron_mg, fiber_g, carbs_g,
      price_inr, sugar_tier, protein_tier, fat_tier,
      traits, trait_source, trait_confidence, trait_reasons,
      scout_score, nova_group,
      data_quality_score, data_completeness, facet_confidence,
      brand_tier, pack_size_value, pack_size_unit,
      use_cases, search_doc,
      embedding, type_embedding,
      click_count, save_count, last_interaction_at,
      built_at, source_hash, updated_at
    ) VALUES ${sql.unsafe(vals)}
    ON CONFLICT (product_id) DO UPDATE SET
      canonical_product_id = EXCLUDED.canonical_product_id,
      slug = EXCLUDED.slug, name = EXCLUDED.name, brand = EXCLUDED.brand,
      category = EXCLUDED.category, subcategory = EXCLUDED.subcategory, l3_category = EXCLUDED.l3_category,
      primary_type = EXCLUDED.primary_type, base_name = EXCLUDED.base_name, form = EXCLUDED.form,
      flavours = EXCLUDED.flavours, variants = EXCLUDED.variants,
      is_veg = EXCLUDED.is_veg, is_vegan = EXCLUDED.is_vegan, is_gluten_free = EXCLUDED.is_gluten_free,
      is_jain = EXCLUDED.is_jain, is_palm_oil_free = EXCLUDED.is_palm_oil_free, has_added_sugar = EXCLUDED.has_added_sugar,
      allergens = EXCLUDED.allergens, claims = EXCLUDED.claims,
      sugar_g = EXCLUDED.sugar_g, protein_g = EXCLUDED.protein_g, fat_g = EXCLUDED.fat_g,
      saturated_fat_g = EXCLUDED.saturated_fat_g, sodium_mg = EXCLUDED.sodium_mg, energy_kcal = EXCLUDED.energy_kcal,
      calcium_mg = EXCLUDED.calcium_mg, iron_mg = EXCLUDED.iron_mg, fiber_g = EXCLUDED.fiber_g, carbs_g = EXCLUDED.carbs_g,
      price_inr = EXCLUDED.price_inr, sugar_tier = EXCLUDED.sugar_tier, protein_tier = EXCLUDED.protein_tier, fat_tier = EXCLUDED.fat_tier,
      traits = EXCLUDED.traits, trait_source = EXCLUDED.trait_source, trait_confidence = EXCLUDED.trait_confidence, trait_reasons = EXCLUDED.trait_reasons,
      scout_score = EXCLUDED.scout_score, nova_group = EXCLUDED.nova_group,
      data_quality_score = EXCLUDED.data_quality_score, data_completeness = EXCLUDED.data_completeness, facet_confidence = EXCLUDED.facet_confidence,
      brand_tier = EXCLUDED.brand_tier, pack_size_value = EXCLUDED.pack_size_value, pack_size_unit = EXCLUDED.pack_size_unit,
      use_cases = EXCLUDED.use_cases, search_doc = EXCLUDED.search_doc,
      embedding = EXCLUDED.embedding, type_embedding = EXCLUDED.type_embedding,
      click_count = EXCLUDED.click_count, save_count = EXCLUDED.save_count, last_interaction_at = EXCLUDED.last_interaction_at,
      built_at = EXCLUDED.built_at, source_hash = EXCLUDED.source_hash, updated_at = EXCLUDED.updated_at
  `);
}

async function loadExistingHashes(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const sql2 = postgres(process.env.SUPABASE_DB_URL!, { max: 1, idle_timeout: 30 });
    try {
      const rows = await sql2<Array<{ product_id: string; source_hash: string | null }>>`
        SELECT product_id, source_hash FROM product_search_index WHERE source_hash IS NOT NULL
      `;
      for (const row of rows) {
        if (row.source_hash) map.set(row.product_id, row.source_hash);
      }
    } finally {
      await sql2.end({ timeout: 5 });
    }
  } catch (err) {
    console.warn("[search:build-index] loadExistingHashes failed:", err instanceof Error ? err.message : err);
  }
  return map;
}

async function loadExistingIds(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const sql2 = postgres(process.env.SUPABASE_DB_URL!, { max: 1, idle_timeout: 30 });
    try {
      const rows = await sql2<Array<{ product_id: string }>>`
        SELECT product_id FROM product_search_index
      `;
      for (const row of rows) set.add(row.product_id);
    } finally {
      await sql2.end({ timeout: 5 });
    }
  } catch (err) {
    console.warn("[search:build-index] loadExistingIds failed:", err instanceof Error ? err.message : err);
  }
  return set;
}

async function main() {
  const args = parseArgs();
  const supabase = adminClient();
  // Large chunks so all LLM batches in a chunk run under the concurrency pool at once
  // (1000 products = 50 batches of 20). Concurrency set via SEARCH_ENRICH_CONCURRENCY.
  const enrichChunk = 1000;
  const allFinalized: Awaited<ReturnType<typeof buildIndexFromProducts>> = [];
  const existingHashes = args.skipUnchanged ? await loadExistingHashes() : new Map<string, string>();
  const existingIds = args.skipExisting ? await loadExistingIds() : new Set<string>();

  console.log("[search:build-index] loading products…", {
    category: args.category,
    subcategory: args.subcategory,
    skipUnchanged: args.skipUnchanged,
    skipExisting: args.skipExisting,
  });

  // Direct SQL — PostgREST .range() caps at 1000 rows total, silently dropping 90%+ of products.
  // Also use direct SQL for upserts — PostgREST statement_timeout kills bulk vector upserts.
  const sql = postgres(process.env.SUPABASE_DB_URL!, { max: 2, idle_timeout: 120 });
  let dbRows: Array<Record<string, unknown>>;
  let pgQuery = sql`
    SELECT id, slug, name, brand, super_category, category, subcategory, l3_category,
           net_weight, price_inr, mrp_inr, nutrition, ingredients_raw, attributes
    FROM products
    WHERE platform = 'zepto'
  `;
  if (args.category) pgQuery = sql`${pgQuery} AND category = ${args.category}`;
  if (args.subcategory) pgQuery = sql`${pgQuery} AND subcategory = ${args.subcategory}`;
  dbRows = await pgQuery;

  const allCandidates: EnrichSource[] = [];
  for (const p of dbRows!) {
    const attrs = (p.attributes ?? {}) as Record<string, string>;
    const hasDeepseekLabel =
      attrs["DeepSeek Label Extracted"] != null ||
      attrs["DeepSeek Overall Confidence"] != null;
    if (!hasDeepseekLabel) continue;
    // DeepSeek-labeled products always enrich — even with sparse nutrition/ingredients
    // the LLM produces useful traits from partial data. The pre-DeepSeek era isCatalogVisible
    // gate is obsolete for enrichment (still active for public catalog display).

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
      core_scores: null,
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
      const UPSERT_BATCH = 25;
      for (let j = 0; j < finalized.length; j += UPSERT_BATCH) {
        const part = finalized.slice(j, j + UPSERT_BATCH);
        try {
          await upsertIndexRows(sql, part);
        } catch (upsertErr) {
          console.error("[search:build-index] upsert failed:", upsertErr instanceof Error ? upsertErr.message : upsertErr);
          process.exit(1);
        }
      }
      console.log(`[search:build-index] upserted ${allFinalized.length} rows total`);
    }
  }

  let capped = args.limit ? allFinalized.slice(0, args.limit) : allFinalized;

  if (capped.length) {
    console.log(`[search:build-index] global canonical clustering (${capped.length} rows)…`);
    capped = await assignCanonicalClusters(capped);

    if (!args.dryRun) {
      // Only need to update canonical_product_id — use simple UPDATEs
      for (let i = 0; i < capped.length; i += 25) {
        const slice = capped.slice(i, i + 25);
        const ids = slice.map(r => esc(r.product_id) + "::uuid").join(",");
        const cases = slice.map(r =>
          `WHEN product_id = ${esc(r.product_id)}::uuid THEN ${esc(r.canonical_product_id)}::uuid`
        ).join(" ");
        try {
          await sql.unsafe(`
            UPDATE product_search_index
            SET canonical_product_id = CASE ${sql.unsafe(cases)} END,
                updated_at = now()
            WHERE product_id IN (${sql.unsafe(ids)})
          `);
        } catch (clusterErr) {
          console.error("[search:build-index] canonical upsert failed:", clusterErr instanceof Error ? clusterErr.message : clusterErr);
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
    await sql.end({ timeout: 5 });
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
  await sql.end({ timeout: 5 });
  console.log("[search:build-index] done (snapshot cache cleared)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

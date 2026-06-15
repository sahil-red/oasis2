/**
 * SQL-based candidate retrieval — calls buildSearchSql() via direct DB
 * connection and returns ProductSearchIndexRow[] compatible with the
 * existing pipeline (generateCandidates → ranking → verification).
 *
 * Falls back to empty result when SUPABASE_DB_URL is unset (local dev).
 */
import { embedText } from "@/lib/search/v2/embeddings";
import { buildSearchSql } from "@/lib/search/v2/search-sql";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { semanticTypeMatches, setTypeCentroids, setCategoryTypeMap, setTypeNormalize } from "@/lib/search/v2/type-centroids";

export async function fetchCandidatesWithSql(
  intent: SearchIntentV2,
  limit = 200,
  minQuality = 0.5,
): Promise<ProductSearchIndexRow[]> {
  const queryEmbedding = await embedText(intent.raw_query, "query");
  if (!queryEmbedding.length) return [];

  // Get type equivalents — null for pure brand/goal queries (no type filter)
  const types = intent.primary_type
    ? [...(await semanticTypeMatches(intent.primary_type))].slice(0, 8)
    : null;

  // Inject the pre-computed category type map and normalization before calling semanticTypeMatches
  // (these are set by the pipeline at startup — no-op if pipeline hasn't run yet)

  const { sql, params } = buildSearchSql(queryEmbedding, intent, types, limit, minQuality);

  // Connect to Supabase directly
  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!dbUrl) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  try {
    const { default: postgres } = await import("postgres");
    db = postgres(dbUrl, { max: 1, idle_timeout: 5 });

    const rows = await db.unsafe(sql, params as any) as Array<{
      product_id: string; name: string; brand: string | null;
      primary_type: string | null; price_inr: number | null; scout_score: number | null;
      sugar_g: number | null; protein_g: number | null; fat_g: number | null;
      fiber_g: number | null; is_vegan: boolean | null; is_gluten_free: boolean | null;
      is_palm_oil_free: boolean | null; has_added_sugar: boolean | null;
      data_quality_score: number; relevance_score: number; health_score: number;
    }>;

    if (!rows.length) return [];

    // Fetch full rows from product_search_index for the returned IDs
    const ids = rows.map(r => r.product_id);
    const { adminClient } = await import("@/lib/supabase/admin");
    const sb = adminClient();

    // Load full columns in batches
    const fullRows: ProductSearchIndexRow[] = [];
    const BATCH = 100;
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const { data } = await sb
        .from("product_search_index")
        .select("*")
        .in("product_id", batch);

      if (data) {
        for (const r of data) {
          // Merge relevance/health scores from SQL result
          const sqlRow = rows.find(sr => sr.product_id === r.product_id);
          fullRows.push({
            ...(r as unknown as ProductSearchIndexRow),
            knn_distance: sqlRow ? (1 - sqlRow.relevance_score) : null,
          } as ProductSearchIndexRow);
        }
      }
    }

    return fullRows;
  } finally {
    await db?.end();
  }
}

/**
 * SQL-based candidate retrieval — ONE PostgreSQL query (buildSearchSql) over a
 * pooled connection. The query returns every display/pipeline column (no embedding
 * vectors), so rows map straight to ProductSearchIndexRow with no second round-trip.
 *
 * Falls back to empty result when SUPABASE_DB_URL is unset (local dev).
 */
import { embedText } from "@/lib/search/v2/embeddings";
import { buildSearchSql } from "@/lib/search/v2/search-sql";
import { mapDbRow } from "@/lib/search/v2/index-queries";
import { getSearchPool } from "@/lib/search/v2/db-pool";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { semanticTypeMatches } from "@/lib/search/v2/type-centroids";

export async function fetchCandidatesWithSql(
  intent: SearchIntentV2,
  limit = 200,
  minQuality = 0.5,
): Promise<ProductSearchIndexRow[]> {
  const TIMING = process.env.SEARCH_TIMING === "1";
  let _t = Date.now();
  const lap = (label: string) => { if (TIMING) { console.log(`[timing]   ${label}: ${Date.now() - _t}ms`); _t = Date.now(); } };

  const queryEmbedding = await embedText(intent.raw_query, "query");
  lap("embed");
  if (!queryEmbedding.length) return [];

  // Type equivalents — null for pure brand/goal queries (no type filter).
  const types = intent.primary_type
    ? [...(await semanticTypeMatches(intent.primary_type))].slice(0, 8)
    : null;
  lap("semanticTypeMatches");

  const { sql, params } = buildSearchSql(queryEmbedding, intent, types, limit, minQuality);

  const db = await getSearchPool();
  if (!db) return [];

  const rows = (await db.unsafe(sql, params as unknown[])) as Array<Record<string, unknown>>;
  lap(`ANN query (${rows.length} rows, single round-trip)`);
  if (!rows.length) return [];

  // Map straight to ProductSearchIndexRow — the query already selected every column
  // the pipeline needs. knn_distance is derived from the in-DB cosine relevance.
  const out = rows.map((r) => {
    const row = mapDbRow(r);
    const rel = r.relevance_score;
    row.knn_distance = typeof rel === "number" ? 1 - rel : null;
    return row;
  });
  lap("map rows");
  return out;
}

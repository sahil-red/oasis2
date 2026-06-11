/**
 * In-DB candidate retrieval (pgvector). Uses the lightweight search_v2_ids RPC
 * for ANN-based cosine ordering, then fetches SLIM rows via REST for the result set.
 * The RPC's per-row cosine distance rides along as knn_distance, so the raw
 * 1024-dim vectors never leave the database.
 * Egress: 200 IDs × ~60 bytes (RPC) + 200 slim rows × ~3 KB ≈ 600 KB total
 * (vs ~5 MB when rows carried embedding JSON).
 */
import { adminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/search/v2/embeddings";
import { INDEX_COLUMNS, mapDbRow } from "@/lib/search/v2/index-queries";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN } from "@/lib/search/v2/types";

type KnnHit = { product_id: string; distance: number };

export async function fetchCandidatePool(
  intent: SearchIntentV2,
  minQuality = DATA_QUALITY_MIN,
  limit = 200,
): Promise<ProductSearchIndexRow[]> {
  const supabase = adminClient();

  // Generate query embedding once
  const queryEmbed = await embedText(intent.raw_query, "query");

  // Step 1: Lightweight RPC — returns only product_ids + distances
  const vecStr = queryEmbed.length ? `[${queryEmbed.join(",")}]` : null;
  if (!vecStr) return [];

  const { data: ids, error: rpcErr } = await supabase.rpc("search_v2_ids", {
    p_query_embedding: vecStr,
    p_limit: limit,
    p_min_quality: minQuality,
    p_primary_type: intent.primary_type ?? null,
  });

  if (rpcErr || !Array.isArray(ids) || !ids.length) {
    if (rpcErr) console.warn("[db-candidates] RPC failed:", rpcErr.message);
    return [];
  }

  return fetchRows(supabase, ids as KnnHit[]);
}

async function fetchRows(
  supabase: ReturnType<typeof adminClient>,
  hits: KnnHit[],
): Promise<ProductSearchIndexRow[]> {
  const distanceById = new Map<string, number>();
  for (const h of hits) {
    if (h?.product_id != null && h.distance != null) {
      distanceById.set(h.product_id, Number(h.distance));
    }
  }

  const productIds = hits.map((h) => h.product_id);
  const results: ProductSearchIndexRow[] = [];
  const BATCH = 100;
  for (let i = 0; i < productIds.length; i += BATCH) {
    const batch = productIds.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("product_search_index")
      .select(INDEX_COLUMNS)
      .in("product_id", batch);

    if (error) {
      console.warn("[db-candidates] REST fetch failed:", error.message);
      continue;
    }
    if (data) {
      for (const row of data) {
        const mapped = mapDbRow(row as Record<string, unknown>);
        mapped.knn_distance = distanceById.get(mapped.product_id) ?? null;
        results.push(mapped);
      }
    }
  }
  return results;
}

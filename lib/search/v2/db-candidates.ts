/**
 * In-DB candidate retrieval (pgvector). Uses the lightweight search_v2_ids RPC
 * for ANN-based cosine ordering, then fetches full rows via REST for the result set.
 * Egress: 200 IDs × 50 bytes = 10 KB (RPC) + 200 full rows × 3 KB = 600 KB total.
 */
import { adminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/search/v2/embeddings";
import { mapDbRow } from "@/lib/search/v2/index-queries";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN } from "@/lib/search/v2/types";

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

  if (rpcErr || !Array.isArray(ids) || ids.length < 10) {
    if (rpcErr) console.warn("[db-candidates] RPC failed:", rpcErr.message);
    // If type filter returned too few results, retry without it
    if (intent.primary_type && (!Array.isArray(ids) || ids.length < 10)) {
      const { data: ids2 } = await supabase.rpc("search_v2_ids", {
        p_query_embedding: vecStr, p_limit: limit,
        p_min_quality: minQuality, p_primary_type: null,
      });
      if (Array.isArray(ids2) && ids2.length) {
        return fetchRows(supabase, (ids2 as Array<{ product_id: string }>).map(r => r.product_id));
      }
    }
    return [];
  }

  const productIds = (ids as Array<{ product_id: string }>).map((r) => r.product_id);
  return fetchRows(supabase, productIds);
}

async function fetchRows(supabase: ReturnType<typeof adminClient>, productIds: string[]): Promise<ProductSearchIndexRow[]> {
  const results: ProductSearchIndexRow[] = [];
  const BATCH = 100;
  for (let i = 0; i < productIds.length; i += BATCH) {
    const batch = productIds.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("product_search_index")
      .select("*")
      .in("product_id", batch);

    if (error) {
      console.warn("[db-candidates] REST fetch failed:", error.message);
      continue;
    }
    if (data) {
      for (const row of data) {
        results.push(mapDbRow(row as Record<string, unknown>));
      }
    }
  }
  return results;
}

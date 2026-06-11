/**
 * In-DB candidate retrieval (pgvector). Uses the search_v2_candidates RPC for
 * ANN-based cosine ordering when the ivfflat index exists, with a simple REST
 * query fallback if it fails or returns too few results.
 */
import { adminClient } from "@/lib/supabase/admin";
import { mapDbRow } from "@/lib/search/v2/index-queries";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN } from "@/lib/search/v2/types";

function toVec(arr: number[]): string | null {
  return arr.length ? `[${arr.join(",")}]` : null;
}

async function fetchViaRpc(
  intent: SearchIntentV2,
  queryEmbed: number[],
  typeEmbed: number[],
  limit: number,
): Promise<ProductSearchIndexRow[]> {
  const c = intent.constraints;
  const supabase = adminClient();

  const { data, error } = await supabase.rpc("search_v2_candidates", {
    p_query_embedding: toVec(queryEmbed),
    p_type_embedding: toVec(typeEmbed),
    p_type_exact: intent.primary_type ? [intent.primary_type.toLowerCase()] : null,
    p_type_threshold: 0.15,
    p_min_quality: DATA_QUALITY_MIN,
    p_max_sugar: c.max_sugar_g ?? null,
    p_min_protein: c.min_protein_g ?? null,
    p_max_fat: c.max_fat_g ?? null,
    p_max_calories: c.max_calories ?? null,
    p_max_price: c.max_price ?? null,
    p_need_vegan: Boolean(c.vegan),
    p_need_veg: Boolean(c.vegetarian),
    p_need_gf: Boolean(c.gluten_free),
    p_need_palm_free: Boolean(c.palm_oil_free),
    p_brand: intent.brand ? intent.brand.toLowerCase() : null,
    p_limit: limit,
  });

  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).map(mapDbRow);
}

async function fetchViaRest(
  intent: SearchIntentV2,
  limit: number,
): Promise<ProductSearchIndexRow[]> {
  const c = intent.constraints;
  const supabase = adminClient();

  let query = supabase
    .from("product_search_index")
    .select("*")
    .gte("data_quality_score", DATA_QUALITY_MIN)
    .limit(limit);

  if (intent.primary_type) {
    query = query.eq("primary_type", intent.primary_type.toLowerCase());
  }
  if (intent.brand) {
    query = query.ilike("brand", `%${intent.brand}%`);
  }
  if (c.max_sugar_g != null) query = query.lte("sugar_g", c.max_sugar_g);
  if (c.min_protein_g != null) query = query.gte("protein_g", c.min_protein_g);
  if (c.max_fat_g != null) query = query.lte("fat_g", c.max_fat_g);
  if (c.max_calories != null) query = query.lte("energy_kcal", c.max_calories);
  if (c.max_price != null) query = query.lte("price_inr", c.max_price);
  if (c.vegan) query = query.eq("is_vegan", true);
  if (c.vegetarian) query = query.eq("is_veg", true);
  if (c.gluten_free) query = query.eq("is_gluten_free", true);
  if (c.palm_oil_free) query = query.eq("is_palm_oil_free", true);

  const { data, error } = await query;
  if (error || !Array.isArray(data)) {
    if (error) console.warn("[db-candidates] REST fetch failed:", error.message);
    return [];
  }
  return (data as Record<string, unknown>[]).map(mapDbRow);
}

export async function fetchCandidatePool(
  intent: SearchIntentV2,
  minQuality = DATA_QUALITY_MIN,
  limit = 200,
): Promise<ProductSearchIndexRow[]> {
  const { embedText } = await import("@/lib/search/v2/embeddings");
  const queryEmbed = await embedText(intent.raw_query, "query");
  const typeEmbed = intent.primary_type
    ? await embedText(intent.primary_type, "query")
    : [];

  // Try RPC first (requires ivfflat index)
  const rpcResults = await fetchViaRpc(intent, queryEmbed, typeEmbed, limit);
  if (rpcResults.length >= 3) return rpcResults;

  // RPC failed or returned too few — fall back to simple REST query
  if (rpcResults.length > 0) {
    console.warn("[db-candidates] RPC returned only", rpcResults.length, "results, falling back to REST");
  }
  return fetchViaRest(intent, limit);
}

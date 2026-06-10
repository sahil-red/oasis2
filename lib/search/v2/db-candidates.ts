/**
 * In-DB candidate retrieval (pgvector). Fetches a bounded, pre-filtered pool from the
 * search_v2_candidates RPC instead of loading the whole index into memory. The caller
 * then runs the cheap in-memory refine (flavour/avoid/goal-category/rank) over ~500 rows.
 */
import { adminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/search/v2/embeddings";
import { mapDbRow } from "@/lib/search/v2/index-queries";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN } from "@/lib/search/v2/types";

function toVec(arr: number[]): string | null {
  return arr.length ? `[${arr.join(",")}]` : null;
}

export async function fetchCandidatePool(
  intent: SearchIntentV2,
  minQuality = DATA_QUALITY_MIN,
  limit = 500,
): Promise<ProductSearchIndexRow[]> {
  const [queryEmbed, typeEmbed] = await Promise.all([
    embedText(intent.raw_query, "query"),
    intent.primary_type ? embedText(intent.primary_type, "query") : Promise.resolve([] as number[]),
  ]);

  const c = intent.constraints;
  const supabase = adminClient();
  const { data, error } = await supabase.rpc("search_v2_candidates", {
    p_query_embedding: toVec(queryEmbed),
    p_type_embedding: toVec(typeEmbed),
    p_type_exact: intent.primary_type ? [intent.primary_type.toLowerCase()] : null,
    p_type_threshold: 0.15,
    p_min_quality: minQuality,
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

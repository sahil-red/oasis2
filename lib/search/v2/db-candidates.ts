/**
 * In-DB candidate retrieval (pgvector-lite). Fetches a bounded, pre-filtered pool
 * from the product_search_index table via a simple REST query — no pgvector indexes
 * needed, no cosine ordering. The caller runs the in-memory refine (flavour/avoid/
 * trait ranking/lexical) over ~500 rows. Per-query egress: ~2 MB.
 */
import { adminClient } from "@/lib/supabase/admin";
import { mapDbRow } from "@/lib/search/v2/index-queries";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN } from "@/lib/search/v2/types";

function buildCandidateQuery(intent: SearchIntentV2, limit: number) {
  const supabase = adminClient();
  const c = intent.constraints;

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

  return query;
}

export async function fetchCandidatePool(
  intent: SearchIntentV2,
  minQuality = DATA_QUALITY_MIN,
  limit = 500,
): Promise<ProductSearchIndexRow[]> {
  const query = buildCandidateQuery(intent, limit);
  const { data, error } = await query;

  if (error || !Array.isArray(data)) {
    if (error) console.warn("[db-candidates] fetch failed:", error.message);
    return [];
  }

  return (data as Record<string, unknown>[]).map(mapDbRow);
}

-- Fix search_v2_sql() — the v0032 function used positional $n references
-- that were offset wrong (p_limit at $5 was used for price check).
-- Switch to plpgsql with named params for correctness.
-- Also fix embedding vector conversion from JSON text and add avoid_ingredients.

DROP FUNCTION IF EXISTS search_v2_sql CASCADE;

CREATE OR REPLACE FUNCTION search_v2_sql(
  p_query_embedding_json text,
  p_type_equivalents text[] DEFAULT NULL,
  p_brand_pattern text DEFAULT NULL,
  p_sort text DEFAULT 'best_match',
  p_limit int DEFAULT 48,
  p_max_price numeric DEFAULT NULL,
  p_max_sugar_g numeric DEFAULT NULL,
  p_max_fat_g numeric DEFAULT NULL,
  p_max_calories numeric DEFAULT NULL,
  p_min_protein_g numeric DEFAULT NULL,
  p_vegan boolean DEFAULT NULL,
  p_vegetarian boolean DEFAULT NULL,
  p_gluten_free boolean DEFAULT NULL,
  p_palm_oil_free boolean DEFAULT NULL,
  p_no_added_sugar boolean DEFAULT NULL,
  p_allergens_excluded text[] DEFAULT NULL,
  p_avoid_ingredients text[] DEFAULT NULL,
  p_min_quality numeric DEFAULT 0.5
)
RETURNS TABLE (
  product_id uuid, name text, brand text, primary_type text,
  price_inr numeric, scout_score numeric,
  total_sugar_g numeric, sugar_g numeric, protein_g numeric, fat_g numeric, fiber_g numeric,
  is_vegan boolean, is_gluten_free boolean, is_palm_oil_free boolean,
  has_added_sugar boolean,
  relevance_score numeric, health_score numeric,
  rank_source text
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_query_vec vector(1024);
BEGIN
  -- Parse JSON text array into pgvector
  BEGIN
    v_query_vec := (SELECT array_agg(v::float)::vector(1024) FROM jsonb_array_elements_text(p_query_embedding_json::jsonb) v);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to parse query embedding JSON: %', SQLERRM;
    RETURN;
  END;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      psi.product_id, psi.name, psi.brand, psi.primary_type,
      psi.price_inr, psi.scout_score,
      psi.total_sugar_g, psi.sugar_g, psi.protein_g, psi.fat_g, psi.fiber_g,
      psi.is_vegan, psi.is_gluten_free, psi.is_palm_oil_free,
      psi.has_added_sugar,
      (1.0 - (psi.embedding <=> v_query_vec))::numeric AS relevance_score,
      COALESCE(psi.scout_score / 100.0, 0.45)::numeric AS health_score,
      'v2_sql'::text AS rank_source
    FROM product_search_index psi
    WHERE psi.embedding IS NOT NULL
      AND psi.data_quality_score >= p_min_quality
      -- Type / brand filters
      AND (p_type_equivalents IS NULL OR psi.primary_type = ANY(p_type_equivalents))
      AND (p_brand_pattern IS NULL OR psi.brand ILIKE p_brand_pattern)
      -- Numeric constraints
      AND (p_max_price IS NULL OR psi.price_inr <= p_max_price)
      AND (p_max_sugar_g IS NULL OR COALESCE(psi.total_sugar_g, psi.sugar_g) <= p_max_sugar_g)
      AND (p_max_fat_g IS NULL OR COALESCE(psi.total_fat_g, psi.fat_g) <= p_max_fat_g)
      AND (p_max_calories IS NULL OR COALESCE(psi.total_calories, psi.energy_kcal) <= p_max_calories)
      AND (p_min_protein_g IS NULL OR COALESCE(psi.total_protein_g, psi.protein_g) >= p_min_protein_g)
      -- Boolean flags
      AND (p_vegan IS NULL OR psi.is_vegan = TRUE)
      AND (p_gluten_free IS NULL OR psi.is_gluten_free = TRUE)
      AND (p_palm_oil_free IS NULL OR psi.is_palm_oil_free = TRUE)
      AND (p_no_added_sugar IS NULL OR p_no_added_sugar = FALSE OR psi.has_added_sugar = FALSE)
      -- Avoid ingredients: exclude products whose search_doc contains any avoid phrase
      AND (p_avoid_ingredients IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p_avoid_ingredients) ing
        WHERE psi.search_doc ILIKE '%' || ing || '%'
      ))
      -- Allergens: exclude products with matching allergens
      AND (p_allergens_excluded IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p_allergens_excluded) al
        WHERE psi.search_doc ILIKE '%' || al || '%'
      ))
  )
  SELECT * FROM ranked
  ORDER BY
    CASE p_sort
      WHEN 'cheapest' THEN COALESCE(-ranked.price_inr, -1e9)
      WHEN 'highest_protein' THEN COALESCE(ranked.protein_g, -1)
      WHEN 'lowest_sugar' THEN -COALESCE(COALESCE(ranked.total_sugar_g, ranked.sugar_g), 1e9)
      WHEN 'healthiest' THEN COALESCE(ranked.scout_score, 0)
      ELSE (0.45 * ranked.health_score + 0.35 * ranked.relevance_score)
    END DESC
  LIMIT p_limit;
END;
$$;

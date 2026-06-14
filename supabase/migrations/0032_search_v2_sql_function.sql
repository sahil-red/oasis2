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
  sugar_g numeric, protein_g numeric, fat_g numeric, fiber_g numeric,
  is_vegan boolean, is_gluten_free boolean, is_palm_oil_free boolean,
  has_added_sugar boolean,
  relevance_score numeric, health_score numeric,
  rank_source text
) LANGUAGE sql STABLE AS $$
  SELECT
    psi.product_id, psi.name, psi.brand, psi.primary_type,
    psi.price_inr, psi.scout_score,
    psi.sugar_g, psi.protein_g, psi.fat_g, psi.fiber_g,
    psi.is_vegan, psi.is_gluten_free, psi.is_palm_oil_free,
    psi.has_added_sugar,
    1.0 - (psi.embedding <=> $1::vector(1024)) AS relevance_score,
    COALESCE(psi.scout_score / 100.0, 0.45) AS health_score,
    'v2_sql'::text AS rank_source
  FROM product_search_index psi
  WHERE psi.embedding IS NOT NULL
    AND psi.data_quality_score >= $18
    AND ($2 IS NULL OR psi.primary_type = ANY($2))
    AND ($3 IS NULL OR psi.brand ILIKE $3)
    AND ($5 IS NULL OR psi.price_inr <= $5)
    AND ($6 IS NULL OR COALESCE(psi.total_sugar_g, psi.sugar_g) <= $6)
    AND ($7 IS NULL OR COALESCE(psi.total_fat_g, psi.fat_g) <= $7)
    AND ($8 IS NULL OR COALESCE(psi.total_calories, psi.energy_kcal) <= $8)
    AND ($9 IS NULL OR COALESCE(psi.total_protein_g, psi.protein_g) >= $9)
    AND ($10 IS NULL OR psi.is_vegan = TRUE)
    AND ($12 IS NULL OR psi.is_gluten_free = TRUE)
    AND ($13 IS NULL OR psi.is_palm_oil_free = TRUE)
    AND ($14 IS FALSE OR psi.has_added_sugar = FALSE)
  ORDER BY
    CASE $4
      WHEN 'cheapest' THEN COALESCE(-psi.price_inr, -1e9)
      WHEN 'highest_protein' THEN COALESCE(psi.protein_g, -1)
      WHEN 'lowest_sugar' THEN -COALESCE(COALESCE(psi.total_sugar_g, psi.sugar_g), 1e9)
      WHEN 'healthiest' THEN COALESCE(psi.scout_score, 0)
      ELSE (0.55 * (1.0 - COALESCE((psi.embedding <=> $1::vector(1024)), 1.0)) + 0.35 * COALESCE(psi.scout_score / 100.0, 0.45))
    END DESC
  LIMIT $5;
$$;

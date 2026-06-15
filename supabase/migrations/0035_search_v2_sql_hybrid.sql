-- Hybrid search_v2_sql — the consolidation target.
--
-- Three changes over 0033:
--   1. Lexical leg: fuse ts_rank_cd(search_tsv) with vector cosine so keyword /
--      brand queries get a real lexical signal (needs migration 0034).
--   2. Reconciled no-added-sugar gate: 0033 did `has_added_sugar = FALSE`, which
--      dropped TRUE *and* NULL — so "X without added sugar" returned almost
--      nothing. Now exclude only CONFIDENT cases (flagged AND real sugar): a
--      ~0g-sugar product can't contain added sugar, and an unknown flag is kept.
--   3. Dietary flags filter only when explicitly requested (IS NOT TRUE OR …) —
--      0033 would have filtered on a `false` value too.
--
-- New p_query_text param (DEFAULT NULL) drives the lexical leg; existing callers
-- that omit it degrade gracefully to vector-only. Not yet wired to the live
-- pipeline — exercised via the Python endpoint for A/B against /api/search/ai.

DROP FUNCTION IF EXISTS search_v2_sql CASCADE;

CREATE OR REPLACE FUNCTION search_v2_sql(
  p_query_embedding_json text,
  p_query_text text DEFAULT NULL,
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
  relevance_score numeric, health_score numeric, fts_score numeric,
  rank_source text
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_query_vec vector(1024);
  v_tsquery tsquery;
BEGIN
  -- Parse JSON text array into pgvector
  BEGIN
    v_query_vec := (SELECT array_agg(v::float)::vector(1024) FROM jsonb_array_elements_text(p_query_embedding_json::jsonb) v);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to parse query embedding JSON: %', SQLERRM;
    RETURN;
  END;

  -- websearch_to_tsquery is injection-safe and forgiving of raw user input.
  IF p_query_text IS NOT NULL AND length(btrim(p_query_text)) > 0 THEN
    v_tsquery := websearch_to_tsquery('simple', p_query_text);
  END IF;

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
      (CASE WHEN v_tsquery IS NOT NULL THEN ts_rank_cd(psi.search_tsv, v_tsquery, 32) ELSE 0 END)::numeric AS fts_score,
      'v2_sql_hybrid'::text AS rank_source
    FROM product_search_index psi
    WHERE psi.embedding IS NOT NULL
      AND psi.data_quality_score >= p_min_quality
      -- Type / brand filters
      AND (p_type_equivalents IS NULL OR psi.primary_type = ANY(p_type_equivalents))
      AND (p_brand_pattern IS NULL OR psi.brand ILIKE p_brand_pattern)
      -- Numeric constraints (hard gates — explicit numbers only)
      AND (p_max_price IS NULL OR psi.price_inr <= p_max_price)
      AND (p_max_sugar_g IS NULL OR COALESCE(NULLIF(psi.total_sugar_g, 0), psi.sugar_g) <= p_max_sugar_g)
      AND (p_max_fat_g IS NULL OR COALESCE(NULLIF(psi.total_fat_g, 0), psi.fat_g) <= p_max_fat_g)
      AND (p_max_calories IS NULL OR COALESCE(NULLIF(psi.total_calories, 0), psi.energy_kcal) <= p_max_calories)
      AND (p_min_protein_g IS NULL OR COALESCE(NULLIF(psi.total_protein_g, 0), psi.protein_g) >= p_min_protein_g)
      -- Dietary flags — gate only when explicitly requested TRUE
      AND (p_vegan IS NOT TRUE OR psi.is_vegan = TRUE)
      AND (p_vegetarian IS NOT TRUE OR psi.is_veg = TRUE)
      AND (p_gluten_free IS NOT TRUE OR psi.is_gluten_free = TRUE)
      AND (p_palm_oil_free IS NOT TRUE OR psi.is_palm_oil_free = TRUE)
      -- Reconciled no-added-sugar: exclude only CONFIDENT cases (flagged AND real
      -- sugar). 0g-sugar can't have added sugar; an unknown flag is kept + ranked.
      AND (p_no_added_sugar IS NOT TRUE
           OR NOT (psi.has_added_sugar IS TRUE
                   AND COALESCE(NULLIF(psi.total_sugar_g, 0), psi.sugar_g) > 0.5))
      -- Avoid ingredients / allergens: exclude on search_doc match
      AND (p_avoid_ingredients IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p_avoid_ingredients) ing
        WHERE psi.search_doc ILIKE '%' || ing || '%'
      ))
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
      -- best_match: health-first, then hybrid relevance (semantic + lexical).
      -- Weights are a starting point — tune against `pnpm search:eval`.
      ELSE (0.45 * ranked.health_score
            + 0.35 * ranked.relevance_score
            + 0.20 * ranked.fts_score)
    END DESC
  LIMIT p_limit;
END;
$$;

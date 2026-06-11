-- 0026: In-DB canonical clustering — zero egress.
--
-- The build-time JS clusterer (lib/search/v2/canonical-cluster.ts) embeds
-- "brand + base_name" key text and greedy-clusters at 0.92 cosine. Pulling
-- 16.7k rows × embeddings out of the DB to redo that costs ~hundreds of MB of
-- egress. But base_name is ALREADY the LLM-normalized product family, so the
-- deterministic grouping below catches the same re-listing duplicates with
-- zero false-merge risk and zero egress: group by (brand, base_name),
-- representative = highest data_quality_score (product_id as tiebreaker).
--
-- Idempotent: safe to re-run any time (e.g. after new products land).
-- Search dedupes via dedupeCanonical() on canonical_product_id at query time,
-- and /api/search/canonical lists siblings — both light up immediately.

CREATE OR REPLACE FUNCTION cluster_canonical_products()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows int;
  v_clusters int;
  v_updated int;
  v_multi int;
BEGIN
  WITH grouped AS (
    SELECT
      product_id,
      lower(trim(coalesce(brand, ''))) AS b,
      lower(trim(coalesce(base_name, name))) AS bn,
      row_number() OVER (
        PARTITION BY lower(trim(coalesce(brand, ''))), lower(trim(coalesce(base_name, name)))
        ORDER BY data_quality_score DESC NULLS LAST, product_id
      ) AS rn
    FROM product_search_index
  ),
  reps AS (
    SELECT b, bn, product_id AS rep_id
    FROM grouped
    WHERE rn = 1
  ),
  target AS (
    SELECT g.product_id, r.rep_id
    FROM grouped g
    JOIN reps r USING (b, bn)
  )
  UPDATE product_search_index p
  SET canonical_product_id = t.rep_id
  FROM target t
  WHERE p.product_id = t.product_id
    AND p.canonical_product_id IS DISTINCT FROM t.rep_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*), count(DISTINCT canonical_product_id)
  INTO v_rows, v_clusters
  FROM product_search_index;

  SELECT count(*) INTO v_multi FROM (
    SELECT canonical_product_id
    FROM product_search_index
    GROUP BY canonical_product_id
    HAVING count(*) > 1
  ) m;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'clusters', v_clusters,
    'rows_updated', v_updated,
    'multi_member_clusters', v_multi
  );
END;
$$;

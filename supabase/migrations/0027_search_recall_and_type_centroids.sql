-- 0027: Search recall + type intelligence, in-DB.
--
-- (a) search_v2_rows: single-round-trip candidate fetch — slim row as jsonb
--     (embedding stripped) + cosine distance. Replaces the ids-RPC + REST pair.
--     NOTE: deliberately NO primary_type filter here — a selective WHERE on top
--     of an ivfflat probe starves recall (the probed lists may contain zero rows
--     of a rare type → "tofu" returned 0 despite 19 tofu products). Type recall
--     is served by a separate exact (non-ANN) query instead; the two run in
--     parallel and are unioned by the caller.
--
-- (b) search_v2_typed_rows: exact type fetch (B-tree on primary_type, no ANN),
--     with optional distance to the query vector for downstream ranking.
--
-- (c) search_v2_type_centroids: avg embedding per primary_type — 85-ish rows,
--     loaded once per instance and cached. Restores semantic type matching and
--     data-driven type neighbors (replaces hardcoded neighbor lists) without
--     shipping per-row vectors.

CREATE OR REPLACE FUNCTION search_v2_rows(
  p_query_embedding vector(1024),
  p_limit int DEFAULT 200,
  p_min_quality float DEFAULT 0.5
)
RETURNS TABLE(row_json jsonb, distance float)
LANGUAGE sql STABLE AS $$
  SELECT to_jsonb(pi) - 'embedding' AS row_json,
         (pi.embedding <=> p_query_embedding) AS distance
  FROM product_search_index pi
  WHERE pi.embedding IS NOT NULL
    AND pi.data_quality_score >= p_min_quality
  ORDER BY pi.embedding <=> p_query_embedding
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION search_v2_typed_rows(
  p_primary_type text,
  p_query_embedding vector(1024) DEFAULT NULL,
  p_limit int DEFAULT 200,
  p_min_quality float DEFAULT 0.5
)
RETURNS TABLE(row_json jsonb, distance float)
LANGUAGE sql STABLE AS $$
  SELECT to_jsonb(pi) - 'embedding' AS row_json,
         CASE WHEN p_query_embedding IS NULL OR pi.embedding IS NULL THEN NULL
              ELSE (pi.embedding <=> p_query_embedding) END AS distance
  FROM product_search_index pi
  WHERE pi.primary_type = p_primary_type
    AND pi.data_quality_score >= p_min_quality
  LIMIT p_limit;
$$;

CREATE INDEX IF NOT EXISTS product_search_index_primary_type_btree
  ON product_search_index (primary_type);

CREATE OR REPLACE FUNCTION search_v2_type_centroids(p_min_count int DEFAULT 2)
RETURNS TABLE(primary_type text, centroid text, n bigint)
LANGUAGE sql STABLE AS $$
  SELECT pi.primary_type,
         avg(pi.embedding)::text AS centroid,
         count(*) AS n
  FROM product_search_index pi
  WHERE pi.primary_type IS NOT NULL AND pi.embedding IS NOT NULL
  GROUP BY pi.primary_type
  HAVING count(*) >= p_min_count;
$$;

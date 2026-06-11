-- 0028: Materialized type centroids + in-DB type semantics.
--
-- 1,086 distinct primary_types × 1024-dim centroids ≈ 4.5MB — too heavy to ship
-- to every serverless instance. Instead the centroids live in a table (refreshed
-- after index builds) and the two questions search actually asks are answered
-- in-DB, returning a handful of strings:
--   search_v2_type_matches(type)   → types semantically equivalent to `type`
--   search_v2_type_matches_vec(v)  → same, for a query-embedding (unknown types)
-- This replaces BOTH the dead per-row type_embedding tier AND the hardcoded
-- KNOWN_NEIGHBORS list with data the catalog itself defines.

CREATE TABLE IF NOT EXISTS type_centroids (
  primary_type text PRIMARY KEY,
  centroid vector(1024) NOT NULL,
  n int NOT NULL,
  built_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION refresh_type_centroids(p_min_count int DEFAULT 2)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM type_centroids;
  INSERT INTO type_centroids (primary_type, centroid, n)
  SELECT pi.primary_type, avg(pi.embedding), count(*)
  FROM product_search_index pi
  WHERE pi.primary_type IS NOT NULL AND pi.embedding IS NOT NULL
  GROUP BY pi.primary_type
  HAVING count(*) >= p_min_count;
  SELECT count(*) INTO v_count FROM type_centroids;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION search_v2_type_matches(
  p_type text,
  p_max_distance float DEFAULT 0.15,
  p_limit int DEFAULT 8
)
RETURNS TABLE(primary_type text, distance float, n int)
LANGUAGE sql STABLE AS $$
  SELECT t2.primary_type, (t2.centroid <=> t1.centroid) AS distance, t2.n
  FROM type_centroids t1
  JOIN type_centroids t2 ON t2.primary_type <> t1.primary_type
  WHERE t1.primary_type = p_type
    AND (t2.centroid <=> t1.centroid) <= p_max_distance
  ORDER BY t2.centroid <=> t1.centroid
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION search_v2_type_matches_vec(
  p_vec vector(1024),
  p_max_distance float DEFAULT 0.15,
  p_limit int DEFAULT 8
)
RETURNS TABLE(primary_type text, distance float, n int)
LANGUAGE sql STABLE AS $$
  SELECT t.primary_type, (t.centroid <=> p_vec) AS distance, t.n
  FROM type_centroids t
  WHERE (t.centroid <=> p_vec) <= p_max_distance
  ORDER BY t.centroid <=> p_vec
  LIMIT p_limit;
$$;

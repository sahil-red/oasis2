-- Lightweight candidate RPC — returns only product_ids + distances.
-- Replaces the heavy search_v2_candidates for the initial candidate pool.
-- The caller then fetches full rows via REST for the final K candidates.
-- Egress: 200 rows × ~50 bytes = 10 KB (vs 6 MB before).

CREATE OR REPLACE FUNCTION search_v2_ids(
  p_query_embedding vector(1024),
  p_limit int DEFAULT 200,
  p_min_quality float DEFAULT 0.5,
  p_primary_type text DEFAULT NULL
)
RETURNS TABLE(product_id uuid, distance float)
LANGUAGE sql STABLE AS $$
  SELECT pi.product_id, (pi.embedding <=> p_query_embedding) AS distance
  FROM product_search_index pi
  WHERE pi.embedding IS NOT NULL
    AND pi.data_quality_score >= p_min_quality
    AND (p_primary_type IS NULL OR pi.primary_type = p_primary_type)
  ORDER BY distance
  LIMIT p_limit;
$$;

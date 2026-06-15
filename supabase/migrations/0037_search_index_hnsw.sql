-- Replace ivfflat with HNSW for the embedding ANN indexes.
--
-- ivfflat needs its `lists` retuned as the table grows and degrades to a
-- sequential scan when filters don't align with the list partitions (the "6s
-- cold" problem noted in 0023). HNSW gives better recall and stable latency
-- without rebuild-on-growth, at a modest memory cost — fine at this catalog size.
--
-- Scope note: this accelerates the PURE-KNN paths — search_v2_knn / the
-- type_embedding matches / any `ORDER BY embedding <=> q LIMIT k`. It does NOT
-- speed up the blended best_match ranking in buildSearchSql / search_v2_sql,
-- which sorts on a weighted score (health + relevance + …) and so scans the
-- filtered set. Making that a two-stage ANN-prefilter → rerank is a separate
-- (Phase 5) optimisation; this migration is the safe, additive first step.
--
-- m=16 / ef_construction=64 are sensible defaults. If recall needs tuning, raise
-- `SET hnsw.ef_search` at query time rather than rebuilding.

DROP INDEX IF EXISTS product_search_index_embedding_ivfflat_idx;
DROP INDEX IF EXISTS product_search_index_type_embedding_ivfflat_idx;

CREATE INDEX IF NOT EXISTS product_search_index_embedding_hnsw_idx
  ON public.product_search_index USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS product_search_index_type_embedding_hnsw_idx
  ON public.product_search_index USING hnsw (type_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

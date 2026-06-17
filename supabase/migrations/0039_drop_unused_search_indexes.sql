-- Free disk to stay under the 500MB free-tier limit (DB had ballooned to ~801MB).
--
-- 1. product_search_index_embedding_ivfflat_idx (367MB, ~46% of the DB) — the main
--    retrieval path (buildSearchSql / search_v2_sql) sorts by a WEIGHTED blend
--    (health + relevance + fts), NOT a pure `ORDER BY embedding <=> q`, so it scans
--    the filtered set and never uses this index. Its only scans came from the
--    rarely-hit empty-result fallback (search_v2_rows). Dropping it has zero effect on
--    the main path; the fallback degrades to a seq-scan KNN over ~20k vectors (~1-3s).
-- 2. product_search_index_traits_gin_idx + product_search_index_search_tsv_idx —
--    both had 0 lifetime scans (pg_stat_user_indexes). The FTS blend uses ts_rank_cd
--    on the search_tsv COLUMN (no index needed); nothing issues @@ / jsonb-containment.
--
-- Result: ~801MB → ~412MB. Rebuild a leaner ANN index (HNSW) later if the fallback
-- path's latency matters — mind the 32MB free-tier maintenance_work_mem (0034 trap).

DROP INDEX IF EXISTS product_search_index_embedding_ivfflat_idx;
DROP INDEX IF EXISTS product_search_index_traits_gin_idx;
DROP INDEX IF EXISTS product_search_index_search_tsv_idx;

-- Full-text search column for hybrid (lexical + vector) relevance.
--
-- Today relevance is vector-cosine only; short keyword/brand queries that pure
-- embeddings fumble have no lexical signal. This adds a maintained tsvector over
-- search_doc so search_v2_sql can fuse ts_rank with vector distance.
--
-- 'simple' config (no stemming/stopwords) keeps product + brand names and Hindi
-- transliterations as exact tokens — the vector leg already handles semantics.
-- A STORED generated column auto-maintains from search_doc: no app or
-- index-build change, and it stays correct on every reindex.

ALTER TABLE public.product_search_index
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(search_doc, ''))) STORED;

CREATE INDEX IF NOT EXISTS product_search_index_search_tsv_idx
  ON public.product_search_index USING gin (search_tsv);

-- Full-text column for hybrid (lexical + vector) relevance.
--
-- IMPORTANT: a GENERATED ... STORED column forces a full table rewrite, which on
-- Supabase free tier rebuilds the ivfflat vector index and exceeds the 32MB
-- maintenance_work_mem (ivfkmeans OOM, code 54000). So we use a PLAIN column kept
-- current by a trigger + a one-time backfill: a metadata-only ADD COLUMN with no
-- rewrite, no vector-index rebuild, and no long ACCESS EXCLUSIVE lock.
--
-- 'simple' config keeps product/brand names and Hindi transliterations as exact
-- tokens; the vector leg handles semantics.

ALTER TABLE public.product_search_index ADD COLUMN IF NOT EXISTS search_tsv tsvector;

-- Keep search_tsv in sync with search_doc on every write (index rebuilds + edits).
CREATE OR REPLACE FUNCTION product_search_index_tsv_refresh() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple', coalesce(NEW.search_doc, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_search_index_tsv ON public.product_search_index;
CREATE TRIGGER trg_product_search_index_tsv
  BEFORE INSERT OR UPDATE OF search_doc ON public.product_search_index
  FOR EACH ROW EXECUTE FUNCTION product_search_index_tsv_refresh();

-- One-time backfill of existing rows (incremental index maintenance only — does
-- NOT rebuild the vector index, so it stays within free-tier memory).
UPDATE public.product_search_index
SET search_tsv = to_tsvector('simple', coalesce(search_doc, ''))
WHERE search_tsv IS NULL;

CREATE INDEX IF NOT EXISTS product_search_index_search_tsv_idx
  ON public.product_search_index USING gin (search_tsv);

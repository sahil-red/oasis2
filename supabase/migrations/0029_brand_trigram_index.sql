-- 0029: trigram GIN on brand — fast bare-brand search.
--
-- `brand ILIKE '%pat%'` (the brand retrieval leg for "lays", "kurkure",
-- "haldiram") was an ~865ms sequential scan, and under Promise.all contention
-- with the (now-removed) lexical leg it hit the statement timeout — so brand
-- queries silently fell back to ANN garbage ("lays" → eggs). A 1.2MB trigram
-- index drops it to ~50-90ms.
--
-- A trigram index on search_doc was deliberately NOT added (it would blow the
-- free-tier storage budget); the always-on lexical seq-scan leg was removed
-- instead — the ANN leg already matches flavours/ingredients semantically.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS product_search_index_brand_trgm
  ON product_search_index USING gin (brand gin_trgm_ops);

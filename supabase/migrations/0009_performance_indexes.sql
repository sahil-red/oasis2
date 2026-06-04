-- Performance indexes for catalog search, filtering, and protein sort.

-- GIN index on attributes JSONB — speeds up usecase/L3 Category filter
-- which currently does a full table scan on attributes->>'L3 Category'.
create index if not exists products_attributes_gin_idx
  on public.products using gin (attributes)
  where catalog_visible = true;

-- Functional index on protein for protein-desc sort.
-- Allows ORDER BY (nutrition->>'protein_g_100g')::numeric without a full scan.
create index if not exists products_nutrition_protein_idx
  on public.products (((nutrition->>'protein_g_100g')::numeric) desc nulls last)
  where catalog_visible = true and nutrition is not null;

-- Partial index for deepseek label filter: only rows that HAVE the deepseek_label key.
-- Speeds up .not("ocr_payload->deepseek_label","is",null) by making the matching set tiny.
create index if not exists products_ocr_deepseek_idx
  on public.products (id)
  where catalog_visible = true
    and ocr_payload is not null
    and (ocr_payload ? 'deepseek_label');

-- Compound index on core_scores for score-based joins with category filters.
-- Supabase joins core_scores!inner on product_id; this covers the join + sort.
create index if not exists core_scores_product_score_idx
  on public.core_scores (product_id, score desc nulls last);

-- Index for text search on name + brand (ilike queries).
-- pg_trgm GIN enables fast substring/ilike matching used in catalog search.
create extension if not exists pg_trgm;
create index if not exists products_name_trgm_idx
  on public.products using gin (name gin_trgm_ops)
  where catalog_visible = true;
create index if not exists products_brand_trgm_idx
  on public.products using gin (brand gin_trgm_ops)
  where catalog_visible = true and brand is not null;

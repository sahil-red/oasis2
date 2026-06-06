-- Widen pgvector columns for Voyage AI (voyage-multilingual-2 = 1024 dims).
-- Existing 384-dim vectors are cleared; rebuild index after migrate.

drop index if exists public.product_search_index_embedding_ivfflat_idx;
drop index if exists public.product_search_index_type_embedding_ivfflat_idx;

alter table public.product_search_index
  alter column embedding type vector(1024) using null::vector(1024),
  alter column type_embedding type vector(1024) using null::vector(1024);

alter table public.goal_trait_map
  alter column goal_embedding type vector(1024) using null::vector(1024);

alter table public.category_trait_profile
  alter column trait_centroid type vector(1024) using null::vector(1024);

create index if not exists product_search_index_embedding_ivfflat_idx
  on public.product_search_index using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists product_search_index_type_embedding_ivfflat_idx
  on public.product_search_index using ivfflat (type_embedding vector_cosine_ops) with (lists = 50);

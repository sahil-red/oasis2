-- Search V2 LLM-first layer: pgvector embeddings + schema alignment (SEARCH_V2_PLAN.md §4, §16.2)
create extension if not exists vector;

-- product_search_index: semantic facets + vectors
alter table public.product_search_index
  add column if not exists base_name text,
  add column if not exists type_embedding vector(384),
  add column if not exists embedding vector(384),
  add column if not exists trait_reasons jsonb not null default '{}',
  add column if not exists last_interaction_at timestamptz;

-- goal_trait_map: embedding-keyed nutrition graph
alter table public.goal_trait_map
  add column if not exists goal_phrase text,
  add column if not exists goal_embedding vector(384),
  add column if not exists support_count int not null default 0;

update public.goal_trait_map
set goal_phrase = coalesce(goal_phrase, display_name)
where goal_phrase is null;

-- category_trait_profile: centroid for goal candidate selection
alter table public.category_trait_profile
  add column if not exists trait_centroid vector(384);

create index if not exists product_search_index_embedding_ivfflat_idx
  on public.product_search_index using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists product_search_index_type_embedding_ivfflat_idx
  on public.product_search_index using ivfflat (type_embedding vector_cosine_ops) with (lists = 50);

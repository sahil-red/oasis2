-- Search V2: incremental re-enrich + Postgres lexical scoring (§16.1, §7a)
alter table public.product_search_index
  add column if not exists source_hash text;

create index if not exists product_search_index_source_hash_idx
  on public.product_search_index (source_hash);

-- Lexical rerank over candidate IDs (trigram similarity on search_doc)
create or replace function public.search_v2_lexical_scores(
  p_query text,
  p_product_ids uuid[]
)
returns table (product_id uuid, score real)
language sql
stable
as $$
  select
    psi.product_id,
    similarity(coalesce(psi.search_doc, psi.name, ''), p_query)::real as score
  from public.product_search_index psi
  where psi.product_id = any (p_product_ids)
    and coalesce(psi.search_doc, psi.name, '') <> '';
$$;

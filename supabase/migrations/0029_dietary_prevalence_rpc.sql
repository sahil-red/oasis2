-- Dietary prevalence per primary_type for smart chip suppression.
-- Lightweight COUNT aggregation (~4KB response for ~600 types).
create or replace function search_v2_dietary_prevalence()
returns table (
  primary_type text,
  total bigint,
  vegan bigint,
  gf bigint,
  pof bigint,
  jain bigint
)
language sql
stable
as $$
  select
    coalesce(primary_type, 'unknown') as primary_type,
    count(*)::bigint as total,
    count(*) filter (where is_vegan)::bigint as vegan,
    count(*) filter (where is_gluten_free)::bigint as gf,
    count(*) filter (where is_palm_oil_free)::bigint as pof,
    count(*) filter (where is_jain)::bigint as jain
  from product_search_index
  group by primary_type;
$$;

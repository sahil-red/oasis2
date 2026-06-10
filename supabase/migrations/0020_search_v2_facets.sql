-- Distinct brands + primary_types for the fast-path, without loading the whole index.
create or replace function search_v2_facets()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'brands', (
      select coalesce(jsonb_agg(b), '[]'::jsonb)
      from (select distinct lower(brand) b from product_search_index where brand is not null) s
    ),
    'primary_types', (
      select coalesce(jsonb_agg(t), '[]'::jsonb)
      from (select distinct lower(primary_type) t from product_search_index where primary_type is not null) s
    )
  );
$$;

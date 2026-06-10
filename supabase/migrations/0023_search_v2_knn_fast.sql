-- Make search_v2_candidates actually use the ANN indexes.
--
-- The 0021 version wrapped the KNN distance in CASE expressions, which defeats
-- ivfflat entirely → sequential scan over every 1024-dim vector (6s+ cold, and
-- the type-embedding filter arm doubled the math → statement timeouts).
--
-- Restructure:
--   1. Bounded ANN probe on `embedding` (top ~2000 by query distance).
--   2. Bounded ANN probe on `type_embedding` (top ~800, when a type vector is given).
--   3. Exact-type btree matches (primary_type = any(...)).
--   Membership = union of those arms; cheap filters apply on the bounded pool;
--   final exact ordering runs over ≤ ~3k rows instead of the whole table.
--
-- Also rebuild both ivfflat indexes: they were created when the table held ~3k
-- rows; at 16.7k the clustering is stale. lists ≈ sqrt(n) ≈ 128.

-- k-means for lists=128 over 16.7k × 1024-dim needs ~46MB; default is 32MB.
set maintenance_work_mem = '96MB';

drop index if exists product_search_index_embedding_ivfflat_idx;
create index product_search_index_embedding_ivfflat_idx
  on product_search_index using ivfflat (embedding vector_cosine_ops) with (lists = 128);

drop index if exists product_search_index_type_embedding_ivfflat_idx;
create index product_search_index_type_embedding_ivfflat_idx
  on product_search_index using ivfflat (type_embedding vector_cosine_ops) with (lists = 128);

reset maintenance_work_mem;

analyze product_search_index;

create or replace function search_v2_candidates(
  p_query_embedding vector(1024),
  p_type_embedding  vector(1024) default null,
  p_type_exact      text[]       default null,
  p_type_threshold  float        default 0.15,
  p_min_quality     float        default 0.5,
  p_max_sugar       float        default null,
  p_min_protein     float        default null,
  p_max_fat         float        default null,
  p_max_calories    float        default null,
  p_max_price       float        default null,
  p_need_vegan      boolean      default false,
  p_need_veg        boolean      default false,
  p_need_gf         boolean      default false,
  p_need_palm_free  boolean      default false,
  p_brand           text         default null,
  p_limit           int          default 500
)
returns setof product_search_index
language plpgsql stable as $$
declare
  -- Bounded membership pools. ivfflat only drives a scan when the ORDER BY is
  -- the bare distance expression AND the LIMIT is a plan-time constant — no
  -- CASE tricks anywhere near the index scan.
  ann_ids  uuid[];
  type_ids uuid[];
begin
  perform set_config('ivfflat.probes', '10', true);

  if p_query_embedding is not null then
    select array_agg(product_id) into ann_ids
    from (
      select pi2.product_id
      from product_search_index pi2
      where pi2.embedding is not null
      order by pi2.embedding <=> p_query_embedding
      limit 2000
    ) q;
  end if;

  if p_type_embedding is not null then
    select array_agg(product_id) into type_ids
    from (
      select pi3.product_id
      from product_search_index pi3
      where pi3.type_embedding is not null
        and pi3.type_embedding <=> p_type_embedding <= p_type_threshold
      order by pi3.type_embedding <=> p_type_embedding
      limit 800
    ) t;
  end if;

  if p_query_embedding is null and p_type_embedding is null
     and (p_type_exact is null or cardinality(p_type_exact) = 0) then
    -- Pure-filter browse: no vectors anywhere; order by score.
    return query
    select pi.*
    from product_search_index pi
    where pi.data_quality_score >= p_min_quality
      and (p_brand is null or lower(coalesce(pi.brand,'')) like '%'||p_brand||'%')
      and (p_max_sugar    is null or pi.sugar_g     is null or pi.sugar_g     <= p_max_sugar)
      and (p_min_protein  is null or pi.protein_g   is null or pi.protein_g   >= p_min_protein)
      and (p_max_fat      is null or pi.fat_g       is null or pi.fat_g       <= p_max_fat)
      and (p_max_calories is null or pi.energy_kcal is null or pi.energy_kcal <= p_max_calories)
      and (p_max_price    is null or pi.price_inr   is null or pi.price_inr   <= p_max_price)
      and (not p_need_vegan     or pi.is_vegan         is not false)
      and (not p_need_veg       or pi.is_veg           is not false)
      and (not p_need_gf        or pi.is_gluten_free   is not false)
      and (not p_need_palm_free or pi.is_palm_oil_free is not false)
    order by pi.scout_score desc nulls last
    limit p_limit;
    return;
  end if;

  -- Membership = union of three bounded id pools (ANN probe, type-ANN probe,
  -- exact-type btree). Hash-join against it so the big table is never walked
  -- with an array comparison per row.
  return query
  with pool as (
    select unnest(coalesce(ann_ids,  '{}'::uuid[])) as product_id
    union
    select unnest(coalesce(type_ids, '{}'::uuid[]))
    union
    select pi0.product_id
    from product_search_index pi0
    where p_type_exact is not null and cardinality(p_type_exact) > 0
      and pi0.primary_type = any(p_type_exact)
  )
  select pi.*
  from product_search_index pi
  join pool on pool.product_id = pi.product_id
  where pi.data_quality_score >= p_min_quality
    and (p_brand is null or lower(coalesce(pi.brand,'')) like '%'||p_brand||'%')
    and (p_max_sugar    is null or pi.sugar_g     is null or pi.sugar_g     <= p_max_sugar)
    and (p_min_protein  is null or pi.protein_g   is null or pi.protein_g   >= p_min_protein)
    and (p_max_fat      is null or pi.fat_g       is null or pi.fat_g       <= p_max_fat)
    and (p_max_calories is null or pi.energy_kcal is null or pi.energy_kcal <= p_max_calories)
    and (p_max_price    is null or pi.price_inr   is null or pi.price_inr   <= p_max_price)
    and (not p_need_vegan     or pi.is_vegan         is not false)
    and (not p_need_veg       or pi.is_veg           is not false)
    and (not p_need_gf        or pi.is_gluten_free   is not false)
    and (not p_need_palm_free or pi.is_palm_oil_free is not false)
    -- require an embedding ONLY for pure-vector membership (no type signal);
    -- a type match is valid membership even when the product failed to embed.
    and (
      coalesce(cardinality(p_type_exact), 0) > 0
      or p_type_embedding is not null
      or pi.embedding is not null
    )
  -- Ordering runs over the bounded pool (≤ ~3k rows) — CASE is harmless here.
  order by case when pi.embedding is null then 1 else 0 end,
           case when p_query_embedding is null then 0
                else (pi.embedding <=> p_query_embedding) end
  limit p_limit;
end $$;

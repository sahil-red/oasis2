-- Fix: type-exact / type-embedding matches must be returned even if the product itself
-- has a NULL doc embedding (e.g. rows enriched before Voyage was configured). Only the
-- pure-vector path (no type filter) should require an embedding.
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
language sql stable as $$
  select pi.*
  from product_search_index pi
  where pi.data_quality_score >= p_min_quality
    and (p_brand is null or lower(coalesce(pi.brand,'')) like '%'||p_brand||'%')
    and (
      (p_type_exact is null or cardinality(p_type_exact) = 0) and p_type_embedding is null
      or (p_type_exact is not null and pi.primary_type = any(p_type_exact))
      or (p_type_embedding is not null and pi.type_embedding is not null
          and (pi.type_embedding <=> p_type_embedding) <= p_type_threshold)
    )
    and (p_max_sugar    is null or pi.sugar_g    is null or pi.sugar_g    <= p_max_sugar)
    and (p_min_protein  is null or pi.protein_g  is null or pi.protein_g  >= p_min_protein)
    and (p_max_fat      is null or pi.fat_g      is null or pi.fat_g      <= p_max_fat)
    and (p_max_calories is null or pi.energy_kcal is null or pi.energy_kcal <= p_max_calories)
    and (p_max_price    is null or pi.price_inr  is null or pi.price_inr  <= p_max_price)
    and (not p_need_vegan     or pi.is_vegan        is not false)
    and (not p_need_veg       or pi.is_veg          is not false)
    and (not p_need_gf        or pi.is_gluten_free  is not false)
    and (not p_need_palm_free or pi.is_palm_oil_free is not false)
    -- require an embedding ONLY for the pure-vector path (no type filter); a type match
    -- is valid membership on its own even when the product failed to embed.
    and (
      coalesce(cardinality(p_type_exact), 0) > 0
      or p_type_embedding is not null
      or p_query_embedding is null
      or pi.embedding is not null
    )
  order by case when p_query_embedding is null or pi.embedding is null then 1 else 0 end,
           case when p_query_embedding is null then 0 else (pi.embedding <=> p_query_embedding) end
  limit p_limit;
$$;

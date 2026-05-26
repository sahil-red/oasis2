-- Catalog performance: precomputed visibility + filter/stats RPCs + indexes.

alter table public.products
  add column if not exists catalog_visible boolean not null default false;

comment on column public.products.catalog_visible is
  'True when product passes catalog eligibility (zepto UUID, food taxonomy, complete nutrition).';

create index if not exists products_platform_idx
  on public.products (platform);

create index if not exists products_platform_visible_idx
  on public.products (platform, catalog_visible)
  where catalog_visible = true;

create index if not exists products_catalog_browse_idx
  on public.products (platform, category, subcategory, brand)
  where catalog_visible = true and platform = 'zepto';

create index if not exists products_catalog_price_idx
  on public.products (platform, price_inr)
  where catalog_visible = true and platform = 'zepto';

create index if not exists products_l3_category_idx
  on public.products (l3_category)
  where l3_category is not null;

create index if not exists products_brand_visible_idx
  on public.products (brand)
  where catalog_visible = true and brand is not null;

-- Fast filter dropdowns without scanning the full products table in app code.
create or replace function public.get_catalog_filter_options(p_category text default null)
returns jsonb
language sql
stable
set search_path = public
as $$
  with base as (
    select
      category,
      subcategory,
      brand,
      coalesce(
        nullif(trim(l3_category), ''),
        nullif(trim(attributes->>'L3 Category'), '')
      ) as usecase
    from public.products
    where platform = 'zepto'
      and catalog_visible = true
  ),
  scoped as (
    select *
    from base
    where p_category is null or category = p_category
  )
  select jsonb_build_object(
    'categories',
      coalesce(
        (select jsonb_agg(distinct category order by category)
         from base where category is not null),
        '[]'::jsonb
      ),
    'subcategories',
      coalesce(
        (select jsonb_agg(distinct subcategory order by subcategory)
         from scoped where subcategory is not null),
        '[]'::jsonb
      ),
    'usecases',
      coalesce(
        (select jsonb_agg(distinct usecase order by usecase)
         from scoped where usecase is not null),
        '[]'::jsonb
      ),
    'brands',
      coalesce(
        (select jsonb_agg(distinct brand order by brand)
         from scoped where brand is not null),
        '[]'::jsonb
      )
  );
$$;

create or replace function public.get_catalog_stats()
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'visible', (select count(*)::int from public.products where catalog_visible),
    'scored',
      (select count(*)::int
       from public.core_scores cs
       inner join public.products p on p.id = cs.product_id
       where p.catalog_visible),
    'zepto', (select count(*)::int from public.products where platform = 'zepto')
  );
$$;

-- Cache catalog facets (brands, primary_types) in a tiny summary table.
-- Updates on every search-index build; read in ~50ms instead of 1-2s
-- for the search_v2_facets RPC that scans all 22k rows.
create table if not exists public.catalog_facets (
  id int primary key default 1,
  brands text[] not null default '{}',
  primary_types text[] not null default '{}',
  updated_at timestamptz not null default now()
);

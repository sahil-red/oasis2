-- User-requested product types / categories to add to the catalog
create table if not exists public.product_suggestions (
  id uuid primary key default gen_random_uuid(),
  product_name text not null check (char_length(trim(product_name)) >= 2),
  created_at timestamptz not null default now()
);

create index if not exists product_suggestions_created_at_idx
  on public.product_suggestions (created_at desc);

alter table public.product_suggestions enable row level security;

drop policy if exists "Anyone can insert product suggestions" on public.product_suggestions;
create policy "Anyone can insert product suggestions"
  on public.product_suggestions for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Service role reads product suggestions" on public.product_suggestions;
create policy "Service role reads product suggestions"
  on public.product_suggestions for select
  to service_role
  using (true);

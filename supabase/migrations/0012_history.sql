-- User search history and saved products.

-- ── search_history ────────────────────────────────────────────────────────────
create table if not exists public.search_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  query       text not null,
  intent_tier text,
  rank_source text,
  result_count int,
  created_at  timestamptz not null default now()
);

create index if not exists search_history_user_at_idx
  on public.search_history (user_id, created_at desc);

alter table public.search_history enable row level security;
do $$ begin
  create policy "users_select_own_history" on public.search_history
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "users_insert_own_history" on public.search_history
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "users_delete_own_history" on public.search_history
    for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ── saved_products ────────────────────────────────────────────────────────────
create table if not exists public.saved_products (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  product_slug  text not null,
  product_name  text not null,
  product_brand text,
  product_image text,
  saved_at      timestamptz not null default now(),
  unique (user_id, product_slug)
);

create index if not exists saved_products_user_idx
  on public.saved_products (user_id, saved_at desc);

alter table public.saved_products enable row level security;
do $$ begin
  create policy "users_select_own_saved" on public.saved_products
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "users_insert_own_saved" on public.saved_products
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "users_delete_own_saved" on public.saved_products
    for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

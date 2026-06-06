-- §13 Premium Phase 1: saved searches + alerts

create table if not exists public.saved_searches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  label         text,
  query         text not null,
  preferences   jsonb not null default '{}',
  alert_enabled boolean not null default false,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists saved_searches_user_idx
  on public.saved_searches (user_id, updated_at desc);

alter table public.saved_searches enable row level security;

drop policy if exists "users_select_own_saved_searches" on public.saved_searches;
create policy "users_select_own_saved_searches" on public.saved_searches
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_saved_searches" on public.saved_searches;
create policy "users_insert_own_saved_searches" on public.saved_searches
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_saved_searches" on public.saved_searches;
create policy "users_update_own_saved_searches" on public.saved_searches
  for update using (auth.uid() = user_id);
drop policy if exists "users_delete_own_saved_searches" on public.saved_searches;
create policy "users_delete_own_saved_searches" on public.saved_searches
  for delete using (auth.uid() = user_id);

create table if not exists public.search_alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  saved_search_id uuid references public.saved_searches (id) on delete cascade,
  query           text not null,
  preferences     jsonb not null default '{}',
  last_match_count int not null default 0,
  last_notified_at timestamptz,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists search_alerts_user_idx
  on public.search_alerts (user_id, created_at desc);

alter table public.search_alerts enable row level security;

drop policy if exists "users_select_own_search_alerts" on public.search_alerts;
create policy "users_select_own_search_alerts" on public.search_alerts
  for select using (auth.uid() = user_id);
drop policy if exists "users_insert_own_search_alerts" on public.search_alerts;
create policy "users_insert_own_search_alerts" on public.search_alerts
  for insert with check (auth.uid() = user_id);
drop policy if exists "users_update_own_search_alerts" on public.search_alerts;
create policy "users_update_own_search_alerts" on public.search_alerts
  for update using (auth.uid() = user_id);
drop policy if exists "users_delete_own_search_alerts" on public.search_alerts;
create policy "users_delete_own_search_alerts" on public.search_alerts
  for delete using (auth.uid() = user_id);

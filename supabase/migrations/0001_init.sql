-- Oasis-clone initial schema.
-- Free-tier safe (no storage buckets; image URLs hotlinked from Zepto CDN).
-- Run with `psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql`
-- or paste into the Supabase SQL editor.

create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ────────────────────────────────────────────────────────────
-- Enums
-- ────────────────────────────────────────────────────────────
do $$ begin
  create type ingredient_source as enum ('label_text', 'ocr', 'off', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type concern_severity as enum ('none', 'low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type scrape_status as enum ('queued', 'running', 'succeeded', 'failed', 'paused');
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
-- products
-- ────────────────────────────────────────────────────────────
create table if not exists public.products (
  id              uuid primary key default uuid_generate_v4(),
  zepto_sku       text unique not null,
  slug            text unique not null,
  name            text not null,
  brand           text,
  -- Zepto's native taxonomy. Use these verbatim as the join key for category baselines.
  super_category  text,
  category        text,
  subcategory     text,
  net_weight      text,
  price_inr       numeric(10, 2),
  mrp_inr         numeric(10, 2),
  image_urls      text[] default '{}',
  product_url     text,
  barcode         text,
  ingredients_raw text,
  nutrition       jsonb,
  raw_payload     jsonb,
  scraped_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists products_brand_idx           on public.products (brand);
create index if not exists products_super_category_idx  on public.products (super_category);
create index if not exists products_category_idx        on public.products (category);
create index if not exists products_subcategory_idx     on public.products (subcategory);
create index if not exists products_cat_sub_idx         on public.products (category, subcategory);
create index if not exists products_barcode_idx         on public.products (barcode);
create index if not exists products_name_trgm_idx       on public.products using gin (name gin_trgm_ops);

-- ────────────────────────────────────────────────────────────
-- categories (denormalized taxonomy snapshot from Zepto)
-- One row per (super_category, category, subcategory) triple,
-- so the baseline bootstrap can iterate uniques without a GROUP BY.
-- ────────────────────────────────────────────────────────────
create table if not exists public.zepto_taxonomy (
  id             uuid primary key default uuid_generate_v4(),
  super_category text,
  category       text,
  subcategory    text,
  product_count  int  not null default 0,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  -- `nulls not distinct` makes NULL == NULL inside this constraint, so
  -- categories without a 3rd level (subcategory=NULL) are idempotent on
  -- upsert. Without it, PostgREST returns PGRST125 because Postgres'
  -- default null-distinct behaviour permits duplicate (cat, cat, NULL).
  constraint zepto_taxonomy_uniq
    unique nulls not distinct (super_category, category, subcategory)
);

-- ────────────────────────────────────────────────────────────
-- ingredients (canonical)
-- ────────────────────────────────────────────────────────────
create table if not exists public.ingredients (
  id                 uuid primary key default uuid_generate_v4(),
  name_normalized    text unique not null,
  name_display       text not null,
  name_raw_variants  text[] default '{}',
  e_number           text,
  category           text,
  off_id             text,
  created_at         timestamptz not null default now()
);

create index if not exists ingredients_norm_trgm_idx on public.ingredients using gin (name_normalized gin_trgm_ops);

-- ────────────────────────────────────────────────────────────
-- product_ingredients
-- ────────────────────────────────────────────────────────────
create table if not exists public.product_ingredients (
  product_id    uuid not null references public.products (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  position      int  not null default 0,
  source        ingredient_source not null default 'label_text',
  confidence    real not null default 1.0,
  primary key (product_id, ingredient_id)
);

create index if not exists product_ingredients_ingredient_idx on public.product_ingredients (ingredient_id);

-- ────────────────────────────────────────────────────────────
-- ingredient_concerns
-- ────────────────────────────────────────────────────────────
create table if not exists public.ingredient_concerns (
  id            uuid primary key default uuid_generate_v4(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  concern_type  text not null,
  severity      concern_severity not null,
  why           text,
  evidence_url  text,
  source        text,
  created_at    timestamptz not null default now()
);

create index if not exists ingredient_concerns_ingredient_idx on public.ingredient_concerns (ingredient_id);
create index if not exists ingredient_concerns_severity_idx   on public.ingredient_concerns (severity);

-- ────────────────────────────────────────────────────────────
-- core_scores
-- ────────────────────────────────────────────────────────────
create table if not exists public.core_scores (
  product_id   uuid primary key references public.products (id) on delete cascade,
  score        int  not null check (score between 0 and 100),
  grade        char(1) not null check (grade in ('A','B','C','D','F')),
  band         text not null check (band in ('bad','poor','good','excellent')),
  subscores    jsonb not null default '{}'::jsonb,
  concerns     jsonb not null default '[]'::jsonb,
  breakdown    jsonb not null default '{}'::jsonb,
  rule_version int  not null,
  computed_at  timestamptz not null default now()
);

create index if not exists core_scores_grade_idx on public.core_scores (grade);
create index if not exists core_scores_band_idx  on public.core_scores (band);
create index if not exists core_scores_score_idx on public.core_scores (score desc);

-- ────────────────────────────────────────────────────────────
-- scrape_jobs
-- ────────────────────────────────────────────────────────────
create table if not exists public.scrape_jobs (
  id           uuid primary key default uuid_generate_v4(),
  kind         text not null,
  status       scrape_status not null default 'queued',
  cursor       jsonb,
  stats        jsonb not null default '{}'::jsonb,
  error        text,
  started_at   timestamptz,
  finished_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists scrape_jobs_kind_status_idx on public.scrape_jobs (kind, status);

-- ────────────────────────────────────────────────────────────
-- category_baselines
--   One row per Zepto (category, subcategory). Drives Axis A
--   of the Core score: floor/ceiling band + signed nutrient
--   weights per 100g. Hand-authored entries override
--   LLM-bootstrapped ones (higher `priority`).
-- ────────────────────────────────────────────────────────────
create table if not exists public.category_baselines (
  id            uuid primary key default uuid_generate_v4(),
  category      text not null,
  subcategory   text,
  floor_score   int  not null check (floor_score between 0 and 100),
  ceiling_score int  not null check (ceiling_score between 0 and 100),
  nutrients     jsonb not null default '{}'::jsonb,
  priority      int  not null default 0,  -- higher wins (0 = LLM, 10 = curated)
  source        text not null default 'curated',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (category, subcategory),
  check (ceiling_score >= floor_score)
);

create index if not exists category_baselines_cat_idx on public.category_baselines (category);

-- ────────────────────────────────────────────────────────────
-- llm_cache
-- ────────────────────────────────────────────────────────────
create table if not exists public.llm_cache (
  id            uuid primary key default uuid_generate_v4(),
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  product_type  text not null default '',
  severity      concern_severity not null,
  why           text,
  model         text not null,
  created_at    timestamptz not null default now(),
  unique (ingredient_id, product_type, model)
);

-- ────────────────────────────────────────────────────────────
-- Row-Level Security
-- ────────────────────────────────────────────────────────────
alter table public.products             enable row level security;
alter table public.ingredients          enable row level security;
alter table public.product_ingredients  enable row level security;
alter table public.ingredient_concerns  enable row level security;
alter table public.core_scores          enable row level security;
alter table public.llm_cache            enable row level security;
alter table public.scrape_jobs          enable row level security;
alter table public.zepto_taxonomy       enable row level security;
alter table public.category_baselines   enable row level security;

-- Public read-only access for the web app; writes restricted to service role.
do $$ begin
  create policy "public_read_products" on public.products
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public_read_ingredients" on public.ingredients
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public_read_product_ingredients" on public.product_ingredients
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public_read_concerns" on public.ingredient_concerns
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public_read_core_scores" on public.core_scores
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public_read_zepto_taxonomy" on public.zepto_taxonomy
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "public_read_category_baselines" on public.category_baselines
    for select using (true);
exception when duplicate_object then null; end $$;

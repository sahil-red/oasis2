-- Adds OCR caching + per-product OCR status.
--
-- Source-of-truth resolution (decided after spying on Blinkit's PDP API):
--   • Nutrition (per-100g)       → Blinkit's structured fields PRIMARY.
--                                  OCR only as fallback when missing.
--   • Ingredients with %ages     → Blinkit when present (high-volume SKUs);
--                                  OCR back-label is the fallback for the
--                                  long tail (and is the regulatory source
--                                  of truth under FSSAI either way).
--   • Net quantity / serve size  → Blinkit when present, OCR otherwise.
--
-- We still cache every OCR result aggressively: an image SHA-256 → structured
-- JSON. Re-runs of the scoring pipeline never re-OCR the same image.

-- ────────────────────────────────────────────────────────────
-- image_ocr_cache
--   Keyed on SHA-256 of the *raw image bytes* (not the URL), so CDN re-hashes
--   don't invalidate the cache. The `payload` is the model's structured
--   extraction (ingredients[], nutrition, net qty, serving size, allergens,
--   fssai_license, confidence per field).
-- ────────────────────────────────────────────────────────────
create table if not exists public.image_ocr_cache (
  image_sha256  text primary key,
  image_url     text not null,
  backend       text not null check (backend in ('gemini', 'tesseract', 'manual')),
  model         text,
  payload       jsonb not null,
  -- Self-reported confidence in [0, 1]; useful for "should we Gemini-recheck this?"
  confidence    real not null default 0.0,
  -- Free-form indicators: e.g. {"has_ingredients": true, "has_nutrition_table": true}
  flags         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists image_ocr_cache_url_idx on public.image_ocr_cache (image_url);

-- ────────────────────────────────────────────────────────────
-- products.ocr_*
--   We only ever OCR the back-label. Once chosen, we remember which image
--   it was so re-runs are deterministic.
-- ────────────────────────────────────────────────────────────
alter table public.products
  add column if not exists ocr_image_url text,
  add column if not exists ocr_status    text not null default 'pending'
    check (ocr_status in ('pending', 'success', 'no_label_found', 'failed', 'manual')),
  add column if not exists ocr_payload   jsonb,
  add column if not exists ocr_attempted_at timestamptz;

create index if not exists products_ocr_status_idx on public.products (ocr_status);

-- ────────────────────────────────────────────────────────────
-- products.platform
--   We're polyglot now (Blinkit primary, Zepto/Swiggy later). The
--   sku column was named zepto_sku in 0001 — keep it but augment with a
--   platform tag so the same SKU id from two platforms can coexist.
-- ────────────────────────────────────────────────────────────
alter table public.products
  add column if not exists platform text not null default 'blinkit';

-- Allow the same sku across different platforms by relaxing the unique
-- on zepto_sku to (platform, zepto_sku).
do $$ begin
  alter table public.products drop constraint if exists products_zepto_sku_key;
exception when undefined_object then null; end $$;

do $$ begin
  alter table public.products
    add constraint products_platform_sku_key unique (platform, zepto_sku);
-- Unique constraints are backed by indexes, so Postgres can throw
-- duplicate_table (42P07) instead of duplicate_object (42710).
exception
  when duplicate_object then null;
  when duplicate_table then null;
end $$;

-- RLS for the new table.
alter table public.image_ocr_cache enable row level security;
do $$ begin
  create policy "public_read_image_ocr_cache" on public.image_ocr_cache
    for select using (true);
exception when duplicate_object then null; end $$;

-- Per-pack macro totals so constraint gating ("<5g sugar") checks the whole
-- pack, not per-100g. Computed at index-build time from per-100g × pack size.
alter table public.product_search_index
  add column if not exists total_protein_g numeric,
  add column if not exists total_sugar_g   numeric,
  add column if not exists total_fat_g     numeric,
  add column if not exists total_calories  numeric;

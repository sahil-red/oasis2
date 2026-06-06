-- Persist the per-100g nutrition fields the index computes traits from.
-- These back low_saturated_fat / healthy_fats / calcium_rich / fiber_density /
-- iron_rich / low_carb. The build upserts the full row, so the columns must exist.
alter table public.product_search_index
  add column if not exists saturated_fat_g numeric,
  add column if not exists calcium_mg      numeric,
  add column if not exists fiber_g         numeric,
  add column if not exists iron_mg         numeric,
  add column if not exists carbs_g         numeric;

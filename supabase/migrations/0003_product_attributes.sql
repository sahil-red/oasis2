-- Adds products.attributes for free-form platform-published key/value pairs
-- that are useful to display on the PDP but aren't part of nutrition/ingredients.
--
-- Examples (from Blinkit /v1/layout/product/<sku>):
--   Type, Diet Preference, Flavour, Country of Origin, Shelf Life,
--   Allergen Information, Seller, Seller FSSAI, Customer Care Details,
--   Disclaimer, Return Policy, Key Features, Unit, Serve Size, …
--
-- We dump them as one flat jsonb object {string → string} so the UI can
-- render them as a "Product details" table without knowing every key
-- name in advance.

alter table public.products
  add column if not exists attributes jsonb;

-- A jsonb GIN index lets us do quick "all chips made in India" filters later
-- without touching the heavy `raw_payload` blob.
create index if not exists products_attributes_gin_idx
  on public.products using gin (attributes);

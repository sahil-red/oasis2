-- Search V2: offline enrichment index, nutrition graph, category trait profiles.
-- See SEARCH_V2_PLAN.md

create table if not exists public.product_search_index (
  product_id            uuid primary key references public.products (id) on delete cascade,
  canonical_product_id  uuid,
  slug                  text not null,
  name                  text not null,
  brand                 text,
  category              text,
  subcategory           text,
  l3_category           text,
  primary_type          text,
  type_aliases          text[] default '{}',
  form                  text,
  flavours              text[] default '{}',
  variants              text[] default '{}',
  is_veg                boolean,
  is_vegan              boolean,
  is_gluten_free        boolean,
  is_jain               boolean,
  is_palm_oil_free       boolean,
  has_added_sugar       boolean,
  allergens             text[] default '{}',
  claims                text[] default '{}',
  sugar_g               numeric,
  protein_g             numeric,
  fat_g                 numeric,
  sodium_mg             numeric,
  energy_kcal           numeric,
  price_inr             numeric,
  sugar_tier            text,
  protein_tier          text,
  fat_tier              text,
  traits                jsonb not null default '{}',
  trait_source          jsonb not null default '{}',
  trait_confidence      jsonb not null default '{}',
  scout_score           numeric,
  nova_group            int,
  data_quality_score    numeric not null default 0,
  data_completeness     numeric not null default 0,
  facet_confidence      jsonb not null default '{}',
  brand_tier            text,
  pack_size_value       numeric,
  pack_size_unit        text,
  use_cases             text[] default '{}',
  search_doc              text,
  search_count          int not null default 0,
  click_count           int not null default 0,
  save_count            int not null default 0,
  built_at              timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists product_search_index_primary_type_idx
  on public.product_search_index (primary_type);
create index if not exists product_search_index_category_idx
  on public.product_search_index (category, subcategory);
create index if not exists product_search_index_canonical_idx
  on public.product_search_index (canonical_product_id);
create index if not exists product_search_index_scout_score_idx
  on public.product_search_index (scout_score desc nulls last);
create index if not exists product_search_index_search_doc_trgm_idx
  on public.product_search_index using gin (search_doc gin_trgm_ops);
create index if not exists product_search_index_traits_gin_idx
  on public.product_search_index using gin (traits);

create table if not exists public.goal_trait_map (
  goal_id       text primary key,
  display_name  text not null,
  trait_weights jsonb not null,
  source        text not null default 'seed',
  confidence    numeric not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.category_trait_profile (
  category_key  text primary key,
  category      text,
  subcategory   text,
  trait_means   jsonb not null default '{}',
  product_count int not null default 0,
  rebuilt_at    timestamptz not null default now()
);

-- Bootstrap nutrition graph (§3b)
insert into public.goal_trait_map (goal_id, display_name, trait_weights, source) values
  ('running', 'Running / endurance',
   '{"hydration":0.35,"electrolytes":0.30,"slow_energy":0.15,"low_sugar":0.10,"whole_food":0.10}'::jsonb, 'seed'),
  ('pcos', 'PCOS-friendly',
   '{"fiber_density":0.30,"low_sugar":0.30,"whole_food":0.20,"low_calorie_density":0.10,"clean_label":0.10}'::jsonb, 'seed'),
  ('diabetes', 'Diabetes-friendly',
   '{"fiber_density":0.30,"low_sugar":0.30,"satiety":0.20,"whole_food":0.10,"low_sodium":0.10}'::jsonb, 'seed'),
  ('muscle_gain', 'Muscle gain / bulking',
   '{"protein_density":0.45,"slow_energy":0.20,"whole_food":0.15,"clean_label":0.10,"satiety":0.10}'::jsonb, 'seed'),
  ('kids_tiffin', 'Kids tiffin',
   '{"kid_friendly":0.30,"clean_label":0.25,"low_sugar":0.20,"calcium_rich":0.15,"whole_food":0.10}'::jsonb, 'seed'),
  ('weight_loss', 'Weight loss',
   '{"low_calorie_density":0.30,"low_sugar":0.25,"fiber_density":0.20,"satiety":0.15,"clean_label":0.10}'::jsonb, 'seed'),
  ('gym', 'Gym / fitness',
   '{"protein_density":0.40,"clean_label":0.20,"low_sugar":0.15,"whole_food":0.15,"satiety":0.10}'::jsonb, 'seed')
on conflict (goal_id) do nothing;

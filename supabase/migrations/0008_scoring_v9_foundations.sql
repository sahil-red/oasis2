-- Scoring V9 foundations: ingredient intelligence + extended core_scores metadata.

create table if not exists public.ingredient_intelligence (
  normalized_name   text primary key,
  display_name      text,
  nova_class        smallint check (nova_class between 1 and 4),
  role              text,
  concern_tier      text not null default 'innocuous'
    check (concern_tier in ('innocuous', 'watchful', 'problematic', 'hazardous')),
  concern_reasons   jsonb not null default '[]'::jsonb,
  intrinsic_quality smallint check (intrinsic_quality between 0 and 100),
  synonyms          jsonb not null default '[]'::jsonb,
  model             text,
  rated_at          timestamptz not null default now()
);

create index if not exists ingredient_intelligence_concern_idx
  on public.ingredient_intelligence (concern_tier);

create index if not exists ingredient_intelligence_role_idx
  on public.ingredient_intelligence (role);

alter table public.core_scores
  add column if not exists absolute_score int check (absolute_score between 0 and 100),
  add column if not exists relative_score int check (relative_score between 0 and 100),
  add column if not exists verdict text check (
    verdict in ('daily_staple', 'good_choice', 'occasional_treat', 'skip')
  ),
  add column if not exists verdict_sublabels jsonb not null default '[]'::jsonb,
  add column if not exists role_cohort text check (
    role_cohort in ('staple', 'snack', 'treat', 'meal_replacement', 'adjunct')
  ),
  add column if not exists serving_g_effective numeric,
  add column if not exists cohort_id text,
  add column if not exists cohort_size int;

comment on table public.ingredient_intelligence is
  'LLM-rated canonical ingredients for V9 ingredient_quality subscore.';

-- v10 opinion layer: LLM-written prose verdict, cached per rule_version.
-- Shape: { headline, why, caveat?, tone, model, rule_version, generated_at }
alter table public.core_scores
  add column if not exists opinion jsonb;

comment on column public.core_scores.opinion is
  'v10 LLM editorial verdict — prose only, never numbers. Regenerated when rule_version changes.';

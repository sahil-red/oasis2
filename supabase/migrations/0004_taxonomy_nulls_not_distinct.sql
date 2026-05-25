-- Fixes PGRST125 ("Invalid path specified in request URL") when upserting
-- zepto_taxonomy rows whose subcategory is NULL.
--
-- Postgres' default unique-constraint behaviour treats two NULLs as
-- distinct, so a constraint on (super_category, category, subcategory)
-- permits unlimited (cat, cat, NULL) rows. PostgREST notices this and
-- refuses the upsert because it cannot guarantee idempotency.
--
-- The fix: recreate the constraint with `nulls not distinct` (PG15+).

do $$
declare
  con_name text;
begin
  -- Drop whatever the auto-generated constraint name is, if any.
  select conname into con_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'zepto_taxonomy'
    and c.contype = 'u'
    and array_length(c.conkey, 1) = 3;
  if con_name is not null then
    execute format('alter table public.zepto_taxonomy drop constraint %I', con_name);
  end if;
end $$;

do $$ begin
  alter table public.zepto_taxonomy
    add constraint zepto_taxonomy_uniq
    unique nulls not distinct (super_category, category, subcategory);
exception
  when duplicate_object then null;
  when duplicate_table  then null;
end $$;

-- Force PostgREST to pick up the new constraint right away.
notify pgrst, 'reload schema';

-- One-time reconciliation: clear has_added_sugar on products whose measured
-- sugar is ~0. A 0g-sugar product cannot contain added sugar, so a TRUE flag is a
-- false positive from the ingredient regex / LLM enrichment (classically, the
-- word "sugar" appearing inside a "no added sugar" claim). Idempotent.
--
-- Phase 1 already neutralises bad flags at query time; this corrects the STORED
-- value so display chips, the reconciled revalidate script, and future rebuilds
-- all agree. Mirrors the query-time gate: prefer per-pack total, fall back to
-- per-100g, and only clear when sugar is actually known to be ~0 (NULL is left
-- untouched rather than assumed).

UPDATE public.product_search_index
SET has_added_sugar = FALSE
WHERE has_added_sugar IS TRUE
  AND COALESCE(NULLIF(total_sugar_g, 0), sugar_g) <= 0.5;

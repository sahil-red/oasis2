# Search V2 — Implementation Review v2 (re-review of current working tree)

Re-reviewed the **current uncommitted state** (composer applied a round of fixes since review v1). Read the
actual code, not the status table. Verdict: **most P0/P1/P2 items are genuinely fixed.** But there are
**3 real engineering problems still open** — including a rule-based regression composer *added* — and I'm
explicitly retracting the "acceptable proxy" language from v1: the 500-cut is wrong and must be fixed.

---

## ✅ Verified fixed (read the code, confirmed)

| # | Item | Evidence |
|---|---|---|
| P0 #1 | Allergen filter inverted | `candidate-generation.ts:53` now `return true;` — correct |
| P1 #3 | Hardcoded tea/coffee/poha verification regexes | **removed** — `verification.ts` is now pure batched Groq, non-blocking |
| P1 #4 | Seed-goal string-match shortcut | **removed** — `goal-graph.ts:resolveGoalWeights` goes straight to 0.92 embedding |
| P2 #6 | 3 missing quantitative traits | `traits.ts:104-122` now computes `low_saturated_fat`, `healthy_fats` (unsaturated-ratio percentile), `calcium_rich` |
| P2 #8 | trait_match not normalized | `ranking.ts:100` `normTrait = minMaxNormalize(...)` — all 4 components normalized |
| P2 #9 | Best Budget per ₹ not ₹/100g | `buckets.ts:34-54` `pricePer100g()` with unit conversion |
| P2 #10 | Buckets used raw trait value | `buckets.ts:61-64` `traitEffective()` uses `effectiveTraitScore` + calibration |
| P2 #11 | Bucket size cap | `buckets.ts:56-58` enforces 3–5 (`MIN_BUCKET_ITEMS=3`, max 5) |
| P2 #13 | Enrichment batch size 8 | `enrichment.ts:310` now `?? 28` (in 20–40 range) |
| P2 #15 | Per-product embedding calls | `enrichment.ts:265-276` uses `embedTextBatch(..., 64, "document")`, batched, with query/document `input_type` |
| P0 #2 | Voyage dim lock-in | `0017_voyage_embeddings_1024.sql` widens vectors to `vector(1024)` for `voyage-multilingual-2`; embeddings now pass `input_type` |
| P2 #7 | Calibration identity passthrough | `trait-calibration.ts:38-39` now a **conservative clamp** `min(0.72, raw*0.85)` until the real curve exists — acceptable interim |

Good work by composer — this is a real, faithful pass.

---

## 🔴 Still open — must fix (I was too lax in v1; these are real)

### M1. Rule-based membership block in candidate generation (NEW regression, §0.2 violation)
`lib/search/v2/candidate-generation.ts:152-210` — a "directed short lookups" block that hardcodes:
- a **STOP-word list** (`for/with/healthy/best/…`),
- a **DIETARY keyword set** (`vegan/gluten/sugar/protein/…`),
- an explicit **`milk`/`doodh` excludes `biscuit|cookie`** regex (line 193).

This is exactly the banned "semantic language rules / head-noun rules" — and it *alters membership* (filters
the pool) based on hardcoded food keywords. It's also **redundant**: `verification.ts:14` already flags
`directed && tokens ≤ 2 && !brand` as precision-at-risk, so the batched Groq net is meant to handle exactly
these short-query precision cases. **Fix: delete lines 152-210.** Membership for short queries comes from the
LLM-enriched `primary_type` + `type_embedding` similarity (already implemented above it); residual precision is
the verification net's job. If "Milk Biscuit" leaks into a "milk" search, the real fix is its `primary_type`
being correctly enriched to `biscuit`, not a keyword exclusion.

### M2. The 500-candidate cut uses scale-mismatched `lex + vec`, not RRF (retract v1 "acceptable proxy")
`candidate-generation.ts:226` sorts the cut-to-500 by `tier`, then `b.lex + b.vec`. `lex` is a raw
token-count (0..n) and `vec` is cosine (0..1) — **adding them lets lexical dominate**, so semantically-strong
matches with low lexical overlap (the whole point of hybrid search, and common for goal/vague queries) can be
dropped *before* stage ② ever reranks them. This is a recall bug for exactly the queries Scout exists to
serve. **Fix: cut by RRF(lexical-rank, vector-rank)** — the same rank-based, scale-free fusion already in
`retrieve.ts:23-31` (k=60) — keeping tier-0 (exact type) first. Reuse the RRF helper; don't invent a second
scoring scheme for the cut. (Bites whenever the membership pool > 500: bare single-type queries like
"biscuits", broad goal queries.)

### M3. Canonical clustering is per-batch, not global (§8 incomplete)
`enrichment.ts:292` calls `assignCanonicalClusters(out)` inside `finalizeIndexBatch`, which runs **per
enrichment slice** (`build-search-index.ts:140` calls `buildIndexFromProducts` per load batch). So a brand's
variants that land in different batches **never cluster together** — `canonical_product_id` is only correct
within a batch. The dedupe in `candidate-generation.ts:78-88` then under-collapses. **Fix: run clustering once
over the full built set** (after all batches are enriched, before profiles/upsert in `build-search-index.ts`),
not inside each batch.

---

## 🟠 Should fix (correctness / principle, lower urgency)

### S1. Replace the `requiresLlmIntent` goal-keyword denylist with strict fast-path coverage (P1 #5, re-judged)
`numeric-constraints.ts:117-126` keeps a hand-maintained semantic word list
(`healthy|running|gym|diabetic|pcos|tiffin|junk|workout`) to force the LLM path. It only routes (never assigns
meaning), so it's not a hard violation — **but it's non-exhaustive** and will silently fast-path-mishandle
"keto snacks", "post-workout", "for my marathon", "low-GI". The robust fix needs no denylist: make the
fast-path fire **only when every residual token (after numeric stripping) is a known brand or `primary_type`
from the index** — anything else (incl. "healthy", "keto") is uncovered → LLM. Then delete the denylist
entirely. This is more correct *and* more in the spirit of "no semantic keyword lists."

### S2. Calibration must actually run, and its accuracy signal is weak
The conservative clamp (M-list "fixed") is a fine interim, but §3c isn't truly satisfied until the curve is
built. Two things: (a) run `SEARCH_EVAL_CALIBRATION=1 pnpm search:eval` **after** the index exists, and wire
it into CI; (b) the "hit" signal in `scripts/eval-search.ts:196-205` counts a trait correct when the product
merely matches the case's include-patterns — that conflates *retrieval relevance* with *trait-label accuracy*.
Improve the ground-truth signal before trusting the curve, or the calibration will be measuring the wrong thing.

### S3. Mobile saved-search UI not wired (P3 #18)
`oasis-mobile/src/lib/saved-searches.ts` now has `saveSearch`/`deleteSavedSearch`, but
`oasis-mobile/app/(tabs)/account.tsx` still only lists — no save/delete buttons. Wire the actions.

### S4. Eval goal-bucket / top-1 coverage thin (P3 #16)
64 cases with a real leak gate (58 have `must_exclude`), but only ~1 case each exercises `expected_bucket_ids`
and `expected_top1_patterns`. Add expected buckets/top-1 to more of the 13 goal cases so §15's "goal-bucket
sanity" is actually tested.

---

## ⚙️ Ops (your side — after the above code fixes)
1. Set `EMBEDDING_*` env to **Voyage** (`voyage-multilingual-2`, 1024-dim) + `EMBEDDING_DIM=1024`; `GROQ_API_KEY`;
   `DEEPSEEK_SEARCH_API_KEY`; `SEARCH_V2_ENABLED=true`; `CRON_SECRET`.
2. `pnpm db:migrate` — apply 0013–**0017** (0017 widens vectors to 1024; existing 384 vectors are cleared, so
   migrate **before** building the index).
3. `pnpm search:build-index` — one command: DeepSeek enrichment + math traits + tiers + data-quality +
   batched Voyage embeddings + category profiles + seed goal map. (Apply M3 first, or clustering is per-batch.)
4. `SEARCH_EVAL_CALIBRATION=1 pnpm search:eval` — build the calibration curve **and** enforce leak-rate=0 /
   precision@5 ≥ 0.8 before serving.
5. `pnpm search:ship-check` (fails < 1000 rows) → flip `SEARCH_V2_ENABLED=true`.

---

## Suggested fix order for composer
**M1** (delete the rule block — quickest, biggest principle win) → **M2** (RRF cut) → **M3** (global
clustering) → **S1** (coverage-based fast-path, drop denylist) → S3/S4 → then ops (build index) → **S2**
(calibration run, now that the index exists).

Everything else from review v1 is confirmed resolved. The architecture remains faithful and the remaining
items are contained — M1/M2/M3 are the ones that materially affect result quality.

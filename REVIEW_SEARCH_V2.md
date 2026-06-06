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

## ✅ Fixed in follow-up passes (M1–M3, S1, S3, partial S2/S4)

| Item | Status |
|---|---|
| M1 Rule block in candidate-generation | **Removed** |
| M2 RRF 500-cap | **`rrf.ts` + tier-first RRF cut** |
| M3 Global canonical clustering | **End of `build-search-index.ts`** |
| S1 `requiresLlmIntent` denylist | **`fastPathEligible()` — index coverage only** |
| S2 Calibration | **Improved eval signal + CI step**; run `SEARCH_EVAL_CALIBRATION=1` after full index |
| S3 Mobile UI | **Save/Alert/Delete + alert toggle + in-app alert hits** |
| S4 Eval coverage | **13/13 goal cases have `expected_bucket_ids`; 3 `expected_top1_patterns`** |
| §14 use_case | **`use_case` intent field + `useCaseMatchScore` in ranking** |
| Verification | **Runs after rank; strict keep_ids; cap 50** |

---

## 🟠 Still requires ops (not more code)

See **Ops** section below. Eval merge gate (**leak-rate = 0**) needs **full enriched index + Voyage embeddings + GROQ verification** — partial DB (~216 rows) will not pass all 64 cases.

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

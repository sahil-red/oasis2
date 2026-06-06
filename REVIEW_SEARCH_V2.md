# Search V2 — Implementation Review (branch `search-improvements`)

Reviewed the full `lib/search/v2/` implementation (50 files), migrations 0013–0016, eval harness,
scripts, and UI against `SEARCH_V2_PLAN.md`. Overall: **faithful and ~90% complete, no stubs/TODOs, no
crash risks when data is absent (graceful degradation everywhere).** The items below must be fixed before
treating it as spec-complete. Ordered by priority.

---

## P0 — Bugs / blockers (fix first)

1. **Allergen filter is inverted — breaks every allergen-exclusion query.**
   `lib/search/v2/candidate-generation.ts:53` — `passesAllergens` returns `false` after the loop instead of
   `true`. Any query with `allergens_excluded` (e.g. "nut-free chocolate") filters out **every** product →
   0 results. Change line 53 to `return true;`.

2. **Embeddings provider is NOT Voyage, and the 384-dim lock-in blocks the swap.**
   `lib/search/v2/embeddings.ts:28-56` is a generic OpenAI-compatible adapter defaulting to
   `text-embedding-3-small` (English-centric). Voyage appears only in a comment. Consequences:
   - Multilingual (§9/§12, Hindi/Hinglish "doodh", "bina cheeni") is **not met** by default.
   - `EMBEDDING_DIM=384` (`types.ts:39`) and `vector(384)` are hard-coded in `0014_search_v2_llm_embeddings.sql`.
     OpenAI works via its `dimensions` param; **Voyage/E5 output 512/768/1024 and mostly ignore `dimensions=384`**,
     so adopting the recommended provider needs a **new migration to widen the vector columns** — not a config flip.
   - No query/document `input_type` distinction (Voyage/E5 support it; would improve retrieval).
   - **Decision needed from you:** pick the provider. If Voyage → composer must widen the vector columns to the
     real dim and set `input_type`. If staying OpenAI 3-small → accept English-mostly embeddings (Hindi then
     leans on the LLM intent parser, which is fine, but §12 semantic recovery won't work well).

---

## P1 — §0.2 rule-based violations (your core concern: no semantic language rules)

3. **Hardcoded type-exclusion regexes in verification.**
   `lib/search/v2/verification.ts:27-62` — `filterCandidatesDeterministic` hardcodes
   `tea/green tea` excludes `milk`, `coffee` excludes `milk`, `poha` excludes `milk|paneer`,
   `protein bar` excludes `juice`. This is exactly the banned "semantic language rules / head-noun rules,"
   and it runs **unconditionally** (before and as fallback for the LLM net). Remove it, or gate it strictly to
   the degradation path (only when Groq is unavailable).

4. **Seed-goal string-match shortcut bypasses the embedding key.**
   `lib/search/v2/goal-graph.ts:133-164` — `matchSeedGoalPhrase` does substring/token-overlap matching
   (`p.includes(l)`, `hits/tokens ≥ 0.5`) **before** the embedding path, so "running low on snacks" wrongly
   resolves to the `running` goal. §3b says the embedding key should do this ("'for my morning jog' matches
   'running' without any string rule"). Remove it and rely on the 0.92 embedding path already implemented below it.

5. *(Minor, defensible — note only)* `requiresLlmIntent` keeps a hardcoded goal-keyword list
   (`numeric-constraints.ts:122`). It only routes **to** the LLM (never assigns meaning), so it's not a strict
   violation, but it's a non-exhaustive hand-list in the wrong module (misses "keto", "post-workout", "marathon").
   Acceptable for now; ideally the LLM decides ambiguity.

---

## P2 — Pinned-value deviations

6. **3 quantitative traits never computed.** `lib/search/v2/traits.ts:73-92` computes only 7 of the 10
   quantitative traits — `low_saturated_fat`, `healthy_fats`, `calcium_rich` are **never produced** (and aren't
   in the LLM semantic list either), so they're silently absent from every product. Source fields exist
   (`saturated_fat_g_100g`, `calcium_mg_100g`). Add their math.

7. **Trait confidence calibration is inert.** `eval/trait-calibration.json` is empty → `calibrateTraitConfidence`
   (`trait-calibration.ts:35-37`) is an **identity passthrough**, so raw self-reported LLM confidence is trusted
   directly — the exact thing §3c forbids ("never trusted directly"). The machinery is real but gated behind
   `SEARCH_EVAL_CALIBRATION=1` (never run; not set in CI). Also the "hit" signal (`eval-search.ts:196-205`)
   conflates retrieval relevance with trait accuracy — a loose proxy. Run a real calibration pass (and improve the
   signal), or conservatively clamp LLM confidence until then.

8. **`trait_match` not normalized in ranking.** `lib/search/v2/ranking.ts:100-106` — relevance/health/popularity
   are min-max normalized to [0,1] within the candidate set, but `trait_match` is used raw. §7b requires **each**
   of the 4 components normalized. Normalize trait_match too.

9. **Best Budget uses wrong value metric.** `lib/search/v2/buckets.ts:53-54` divides goal_fit by absolute
   `price_inr`, not by **₹/100g** (§7c). Ignores pack size — a big cheap pack ties a small cheap pack. Use
   `pack_size_value`/`unit` for ₹/100g.

10. **Trait buckets use raw trait value, not `effective_trait_score`.** `buckets.ts:69` ranks by
    `row.traits[trait]`, so a low-confidence/low-data product can win "Best Hydration". §3c/§7c require
    `effective_trait_score` (value × min(data_quality, calibrated_confidence)) — trustworthiness > recall.

11. **Bucket size caps at 3, spec is 3–5; no min-3 guard.** `buckets.ts:32` — allow 3–5 items and don't emit
    buckets with <3 (or relax explicitly).

12. **500-truncation uses a local lexical heuristic, not the RRF hybrid score.**
    `candidate-generation.ts:213` cuts to 500 by a crude token-overlap `lexicalScore`, not stage ②'s RRF score
    (§6). Exact-type-first is honored, but the cut isn't the pinned score. (Chicken/egg: RRF needs the candidates;
    acceptable as a proxy, but worth aligning — at least incorporate the vector/lexical RRF before the hard cut.)

13. **DeepSeek enrichment batch size is 8, spec says 20–40.** `enrichment.ts:254` (`?? 8`), and
    `build-search-index.ts:140` doesn't override it → production runs at 8/call (more calls/cost than intended).
    Set `llmBatchSize` to ~25–30.

14. **Calibration parity bug in learning loop.** `goal-learning.ts:47` calls `effectiveTraitScore` **without**
    the calibration fn, so the learning loop uses raw confidence while ranking/goal_fit use calibrated. Pass
    `calibrateTraitConfidence` for parity.

15. **Per-product embedding calls (not batched).** `enrichment.ts:221-224` issues **2 HTTP embed calls per
    product** in a loop; `embedTextBatch` (`embeddings.ts:111`) is exported but **never used**. For ~10k products
    that's ~20k near-serial requests — very slow / rate-limit-prone. Use the batch path before the full run.

---

## P3 — Eval & coverage gaps

16. **Goal-bucket sanity & top-1 barely exercised.** 64 cases (good type×category coverage incl. Hinglish and
    word-order), and the leak gate is real (58/64 have `must_exclude`). But only **1** case has
    `expected_bucket_ids` and **1** has `expected_top1_patterns` — so the §15 "goal-bucket sanity" metric is
    untested across 12 of 13 goal cases. Add expected buckets/top-1 to more goal cases.
17. **CI doesn't generate the calibration curve** (`search-v2.yml` doesn't set `SEARCH_EVAL_CALIBRATION`).
18. **Mobile saved-searches is read-only** (`oasis-mobile/src/lib/saved-searches.ts`) — no create/delete parity.

---

## What's correct (no changes needed — credit where due)

- Trait split honored: quantitative = percentile-rank math within `primary_type`; semantic = LLM `{value,
  confidence, reason}`; values `null` (not 0) when absent; provenance/confidence populated. (`traits.ts`,
  `llm-enrichment.ts`)
- `data_quality_score` = exactly 0.40·completeness + 0.30·ocr + 0.30·consistency, with 0.50/0.75 bands +
  "Verified by Scout" at ≥0.75. (`data-quality.ts`, `adapter.ts`)
- Type synonymy via `type_embedding` cosine ≥ **0.85**; no synonym table. (`candidate-generation.ts`)
- Filters decide membership; vectors only reorder within the filtered set. (architecture respected)
- RRF **k=60**, equal weight, real Postgres pg_trgm lexical (`search_v2_lexical_scores` RPC). (`retrieve.ts`,
  `0015`)
- Goal candidate gen: top-**K=8** categories by centroid cosine ≥ **0.5**; `category_trait_profile`
  auto-computed from products (no hand-mapped table). (`category-profiles.ts`)
- Goal graph: embedding-keyed resolution ≥ **0.92**; LLM decomposition bounded to the trait vocab + renormalized
  to sum 1; seeds (running/diabetes/PCOS + 4); learning/persistence. (`goal-graph.ts`, `goal-learning.ts`)
- Semantic intent cache: cosine ≥ **0.97**, prefs-aware. (`intent-cache.ts`)
- Fast-path reads brands/types from the **enriched index** (data, not a lexicon); falls through to LLM on
  flavour/goal/negation; LLM escalates to DeepSeek at confidence < **0.6** or ≥**2** constraints.
  (`intent.ts`, `llm-intent.ts`, `index-meta.ts`)
- Numeric extractor stays within explicit numeric/comparator scope (no synonym/goal/hierarchy tables).
  (`numeric-constraints.ts`)
- Popularity safety: **30-day** exponential half-life, **5%** exploration, **14-day** cold-start boost.
  (`popularity.ts`)
- Relaxation via embedding-nearest broader types (no hierarchy table), lowest-priority-first, type/flavour never
  relaxed, always explained. (`relaxation.ts`, `type-neighbors.ts`)
- Clustering via base_name+brand **embedding** proximity ≥ 0.92 (no regex stripping); representative = highest
  data_quality. (`canonical-cluster.ts`)
- Verification batched (one call/~20), non-blocking with graceful fallback. (`verification.ts` — modulo the
  rule regex in P1)
- Explainability: structured (trait, contribution, reason), confidence-gated. (`explain.ts`)
- Premium Phase 1 fully real (DB+RLS+API+cron+UI): saved searches, alerts, Verified-by-Scout badge. (`0016`,
  `app/api/me/*`, `app/api/cron/search-alerts`, `saved-search-actions.tsx`)
- V2 wired into the live endpoint behind `SEARCH_V2_ENABLED` (default false). (`app/api/search/ai/route.ts`)

---

## What you actually need to run (not just "Voyage + enrichment")

1. **Decide the embedding provider** (P0 #2). If Voyage/E5 → widen `vector(384)` columns first.
2. `pnpm db:migrate` — apply 0013–0016 (index + saved-search tables).
3. `pnpm search:build-index` — **one command** that does DeepSeek enrichment + math + tiers + data-quality +
   embeddings + category profiles + seed goal graph, and writes `product_search_index`. (Embeddings and
   enrichment are NOT separate steps.)
4. `pnpm search:eval` — must pass leak-rate=0 / precision@5 ≥ 0.8 before serving.
5. Set env: `SEARCH_V2_ENABLED=true`, `GROQ_API_KEY`, `EMBEDDING_API_KEY/BASE_URL/MODEL/DIM`,
   `DEEPSEEK_SEARCH_API_KEY` (+ label), `CRON_SECRET`.
6. `pnpm search:ship-check` — readiness probe (fails if <1000 index rows).

**Suggested fix order for composer:** P0 #1 (allergen one-liner) → P1 #3,#4 (rule violations) → P2 #6
(missing traits), #8–#11 (ranking/buckets), #15 (batch embeddings) → P0 #2 (provider decision + migration) →
#7/#14 (calibration) → run index build → eval.

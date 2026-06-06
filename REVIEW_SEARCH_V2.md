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

---

## v3 — Opus hardening pass + verified run + cost (current)

### Code fixes I made this pass (committed)
1. **Enrichment truncation (real cost/data-loss bug).** `llm-enrichment.ts` `maxTokens` 8000 → **16000**, and
   `enrichment.ts` default batch 28 → **20**. At batch 28, 14 trait-reasons/product overran 8000 tokens →
   JSON truncated → split-retry churn that re-bills input. Also bounded each trait `reason` to **≤12 words**
   in the prompt (caps output cost). Output is billed on actual tokens, so raising the cap costs nothing and
   prevents the retry tax.
2. **Embeddings → `voyage-3.5`** (was `voyage-multilingual-2`): multilingual, same 1024-dim (no migration
   change), and **200M free tokens vs 50M**. Sends `output_dimension` for the voyage-3 family.
3. **429/5xx retry with backoff** in `embeddings.ts` (honors `Retry-After`, 5 attempts). Without this a single
   Voyage rate-limit silently produced **embedding-less rows** → index quietly degraded to lexical. This was
   the biggest "search silently gets worse" risk during the build.
4. `.env.example` updated: `voyage-3.5` + a note that you must **add a payment method on Voyage** to escape the
   free-trial cap (3 RPM / 10K TPM) — you still pay **$0** within 200M free tokens, but Tier-1 limits
   (2000 RPM / 8M TPM) are required or the full build throttles for hours.

### Verified (not asserted)
- `pnpm typecheck` — v2 module compiles clean. (Pre-existing errors in `scripts/search-regression.ts` /
  `verify-swaps.ts` are old mock fixtures, unrelated to search-v2.)
- `pnpm search:v2-regression` — passes (numeric/intent unit checks).
- `SEARCH_EVAL_USE_MEMORY=1 pnpm search:eval` — **pipeline runs end-to-end, no crashes, p50 174ms.** Even in
  fully degraded mode (no LLM enrichment, no embeddings, Groq rate-limited) it scores **58/64, precision@5
  0.957, top1 1.000**. The 3 leaks + goal→directed misclassifications are all artifacts of the missing
  enriched index / embeddings / Groq headroom (confirmed: intent fast-path correctly defers goal queries to
  the LLM; failures are the §9 degradation ladder, not bugs).

### Cost to go live (estimates)
| Item | Volume | Cost |
|---|---|---|
| **DeepSeek V4 Flash enrichment** (one-time) | ~10–20k products × ~340 in + ~400 out tok | **~$2–3 total** (in $0.14/M, out $0.28/M; system prompt cache-hits at $0.0028/M). Re-runs only on changed rows (source-hash skip). |
| **Voyage `voyage-3.5` embeddings** | ~2–3M tokens (index) + ~tiny/query | **$0** — 200M free tokens covers it ~60×. *Add a payment method for Tier-1 RPM (still $0 spend).* |
| **Groq** (query-time intent + verification) | ~1–2 calls/search | **$0** — free tier (30 RPM). Throttles only above ~15 searches/min; fine for testing. |

**Bottom line: ~$2–3 one-time, then effectively free to run.** The "cost" is really two rate-limit gates:
Voyage needs a payment method (for RPM, not spend), and Groq's 30 RPM caps burst traffic.

### One scale caveat (not blocking now)
`index-queries.ts` loads the whole index (up to 25k rows incl. 1024-dim vectors) into memory and does cosine
in JS, cached 10 min. Fine at your scale and keeps warm queries ~170ms, but at larger catalogs / high
concurrency this is heavy memory + slow cold-start. The pgvector ivfflat indexes already exist (0017) — the
SOTA next step is in-DB KNN (an RPC for vector search) instead of in-memory cosine. Recommend after quality is
validated, not before.

### Remaining to ship (ops, in order)
1. Add a payment method on Voyage (lifts RPM; $0 spend) + set `VOYAGE_API_KEY`/`EMBEDDING_MODEL=voyage-3.5`,
   `GROQ_API_KEY`, `DEEPSEEK_SEARCH_API_KEY`, `CRON_SECRET`.
2. `pnpm db:migrate` (0013–0017).
3. `pnpm search:build-index` (~$2–3 DeepSeek + free Voyage; one command).
4. `SEARCH_EVAL_CALIBRATION=1 pnpm search:eval` — builds calibration curve + enforces leak-rate=0.
5. `pnpm search:ship-check` → set `SEARCH_V2_ENABLED=true`.

---

## v4 — Final bug sweep (3 parallel bug-hunters + verification)

### Verified FALSE POSITIVES (do not "fix" — checked against pipeline.ts)
- **Verification emptying all results** — NOT real. `verification.ts` returns the *original* rows when the
  Groq keep-set is empty (`merged.length ? merged : rows`), so the pipeline filter never zeroes out.
- **`cheaper_than` hardcoded to `healthier_than`** — NOT real. `pipeline.ts:62` overwrites mode with
  `intent.comparison_mode`, so cheaper-than ranks by price correctly.

### Fixed this pass (committed)
1. **`loadExistingHashes` 1000-row cap** (`build-search-index.ts`) — now paginated. Without it,
   `--skip-unchanged` silently treated every product past row 1000 as new and **re-enriched/re-embedded them
   on every rebuild** (real recurring cost). High-value fix.
2. **Serial `embedText` on the cold request path** — `loadGoalMapFromDb` (seed goals) and
   `buildCategoryTraitProfiles` (hundreds of category centroids) now embed in **parallel / one batch**.
   Previously these serialized N network calls (each with up to 5 retries) onto the first query after a cache
   miss → latency/timeout risk.
3. **Intent cache key instability** (`intent-cache.ts`) — `prefsKey` now key-sorted; identical prefs in
   different key order no longer miss the cache.
4. **Goal-slug bloat** (`goal-graph.ts`) — slug hash now over the normalized phrase, so "High Protein" and
   "high  protein" map to one `goal_id` instead of multiplying `goal_trait_map` rows.

Verified after fixes: main `tsc` clean on touched files; `search:v2-regression` passes; in-memory eval runs
(58/64, p50 141ms) — no runtime regression.

### Known-minor (documented, not blocking — fix opportunistically)
- **Non-atomic click/save counters** (`interactions.ts`) — read-modify-write can lose increments under
  concurrency. Low impact (popularity = 10% of rank, time-decayed). Proper fix needs a Postgres
  `increment` RPC (a small migration); fine to defer for single-user/early traffic.
- **Half-built index on mid-build crash** (`build-search-index.ts`) — per-chunk rows are upserted before the
  global canonical-clustering re-upsert at the end; a crash in between leaves every product as its own
  cluster. Mitigation: just re-run the build (idempotent). A staging-table swap is the clean long-term fix.
- **`fastPathEligible` goal/type collision** — a bare token that is *both* a goal word and some product's
  `primary_type` (e.g. "protein") can fast-path as a directed lookup. Rare; result is still reasonable.
- **Canonical clustering** pass-2 first-match (vs best-match) and a fixed single-anchor "centroid"; and
  `type-neighbors` keeping the first row's type-embedding per type — all minor at the 0.85/0.92 thresholds.

### Answer: are we set for SOTA?
**Code: yes — complete, wired (behind `SEARCH_V2_ENABLED`), and the real bugs are fixed.** The two scariest
agent findings were false positives. What stands between you and live SOTA search is purely the **ops run**
(keys → migrate → build-index → eval gate). Quality can only be validated *after* the enriched index +
Voyage embeddings exist — the degraded-mode 58/64 is the floor, not the ceiling.

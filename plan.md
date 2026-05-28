# Scoring revamp (V9) — plan

Two-layer scoring with LLM ingredient intelligence, per-serving normalization, and a human-readable verdict system. Phased migration; V8 stays live until V9 is validated.

---

## 1. Diagnosis (current V8)

| Issue | Symptom | Root cause |
|--------|---------|------------|
| Per-100g only | Masala, tea, coriander rank like staples | Score uses `*_g_100g` without intake weight |
| No cohort separation | “Best chip” looks like “best food” | Single global 0–100 scale |
| Regex ingredient rules | Novel additives slip through | `ingredient-rules.json` + `ingredient-signals.ts` |
| Category band-aids | 20+ `if (cat === …)` in `baselines.ts` | Patches instead of serving + ingredient model |
| Goals vs core drift | Overlapping caps in `lib/goals/fit.ts` | Goals re-derive opinions from raw macros |

---

## 2. Target model

### 2.1 Two layers + blend

| Layer | Range | Meaning |
|--------|--------|---------|
| **Absolute** | 0–100 | How good this food is in general, **per realistic serving** |
| **Relative** | 0–100 | Percentile vs cohort `(category, subcategory, role_cohort)` |
| **Final (Core)** | 0–100 | `0.55 × absolute + 0.45 × relative` (tune after V8/V9 diff) |

Persist: `absolute_score`, `relative_score`, `score` (final), `cohort_id`, `cohort_size`, `serving_g_effective`, `role_cohort`.

### 2.2 Subscores (V9)

```ts
subscores: {
  nutrition: number;    // 0–60, intake-weighted
  ingredient: number;   // 0–30, LLM ingredient intelligence (replaces additives + signals)
  labels: number;       // 0–10, pack-claim audit
}
```

### 2.3 Role cohort (metadata, not hidden)

`role_cohort`: `staple` | `snack` | `treat` | `meal_replacement` | `adjunct`

- **Adjuncts stay in catalog** — tea, spices, oils, condiments remain visible and searchable. No default hiding or down-ranking from browse.
- Absolute caps by role (soft): `treat ≤ 70`, `adjunct ≤ 75`, `staple ≤ 100` — applied at score time, not UI filter.

### 2.4 Serving-size priority

1. `nutrition.extra.serving_size_g` (OCR / LM / prior backfill)
2. LM `serving_size` on structured label
3. CSV / attributes nutrition block
4. `data/category-servings.json` default by category / subcategory / name pattern
5. Pack `net_weight` only when clearly a single-serve unit

Per-serve nutrients stored in `nutrition.extra` as `per_serve_*` (and `serving_g_effective`, `per_serve_basis`).

---

## 3. Verdict labels system

### 3.1 Top-level verdict (primary signal)

Deterministic from `absolute`, `role_cohort`, `hazardous_flag` — **no LLM at display time**.

| Verdict | Logic | Description |
|---------|--------|-------------|
| **Daily staple** | `absolute ≥ 80` AND `role_cohort = staple` | Whole foods, clean ingredients, no concern flags |
| **Good choice** | `absolute 65–79` | Nutritious with minor trade-offs, or top of cohort |
| **Occasional treat** | `absolute 40–64` OR `role_cohort = treat` | Enjoy mindfully, not daily |
| **Skip** | `absolute < 40` OR hazardous hard-cap | Avoid or only when nothing else available |

### 3.2 Sublabels (“why” chips)

Secondary layer — max **3 chips per product**, **dominant story only** (positives for Daily/Good; negatives for Treat/Skip). Schema: `verdict_sublabels: string[]` on `core_scores`.

**Phase 4+**: goal-contextualized chips (same product, different chips per active goal). Design `breakdown.sublabel_candidates` + `goal_sublabels` in schema now; wire in Phase 4.

#### Daily staple

| Sublabel | Rule |
|----------|------|
| Clean protein | `protein_per_serve ≥ 6g` AND no ingredient with `concern_tier ∈ {problematic, hazardous}` |
| Rich in fiber | `fiber_per_serve ≥ 4g` |
| Good for gut | probiotic/prebiotic ingredient, `role = probiotic`, `concern_tier = innocuous` |
| Heart-friendly | `sat_fat_per_serve ≤ 2g` AND `sodium_per_serve ≤ 200mg` AND `fiber_per_serve ≥ 3g` |
| Bone support | calcium ≥ 20% RDA per serve OR fortified calcium/D3 on label |
| Good for bulking | `kcal_per_serve ≥ 200` AND `protein_per_serve ≥ 10g` |
| Low glycemic | `sugar_per_serve ≤ 3g` AND no refined starch in first 3 ingredients |
| Whole food | weighted avg NOVA ≤ 1.5 AND ≤ 5 ingredient segments |
| Naturally fermented | LLM `role = probiotic` AND no artificial preservatives in list |
| Immune boost | Zn / vit C / vit D ≥ 15% RDA per serve |

#### Good choice

| Sublabel | Rule |
|----------|------|
| Healthy snacking | `role_cohort = snack` AND `absolute ≥ 68` |
| Clean carbs | `carbs_per_serve ≥ 15g` from whole grain/legume signals, `sugar_per_serve ≤ 5g` |
| High in protein | `protein_per_serve ≥ 8g` |
| Mindful portions | `role_cohort ∈ {treat, snack}`, `absolute ≥ 60`, `serving_g ≤ 25` |
| Low sodium | `sodium_per_serve ≤ 120mg` |
| Good for weight loss | `kcal_per_serve ≤ 150`, `protein ≥ 5g`, `fiber ≥ 2g` |
| Energy-dense | `kcal_per_serve ≥ 300` AND weighted NOVA ≤ 2 |
| Fortified well | ≥ 3 micronutrients ≥ 15% RDA per serve |
| Good for gym-goers | `protein_per_serve ≥ 10g` AND weighted NOVA ≤ 2 |

#### Occasional treat

| Sublabel | Rule |
|----------|------|
| High in sugar | `sugar_per_serve > 10g` |
| Calorie-dense | `kcal_per_serve ≥ 250`, low protein and fiber |
| Refined carbs inside | first 3 ingredients: maida, sugar, corn syrup, etc. |
| High saturated fat | `sat_fat_per_serve > 4g` |
| Ultra-processed | NOVA-4 position-weight > 40% |
| Artificial flavors | LLM flags artificial flavor/color |
| Best in category | `relative ≥ 80` AND `absolute < 65` |
| Watch serving size | realistic serving > 2× declared serving (future: pack vs label) |

#### Skip

| Sublabel | Rule |
|----------|------|
| Hazardous additive | existing hard-cap |
| Empty calories | `kcal_per_serve ≥ 100`, `protein ≤ 1g`, `fiber = 0` |
| Excessive sodium | `sodium_per_serve > 600mg` |
| Very high in sugar | `sugar_per_serve > 20g` |
| Trans fat present | `trans_fat_per_serve > 0.2g` |
| Label mismatch | marketing audit contradiction |
| Mostly NOVA 4 | NOVA-4 position-weight > 60% |
| Hidden sweetener | ace-K / sucralose / aspartame + “natural” claim |

Implementation: `lib/scoring/verdict.ts` + `lib/scoring/sublabels.ts`.

---

## 4. LLM ingredient intelligence (Phase 2)

### 4.1 Table `ingredient_intelligence`

Per normalized ingredient (cached forever):

```json
{
  "normalized_name": "milk solids",
  "nova_class": 1,
  "role": "base_food",
  "concern_tier": "innocuous",
  "concern_reasons": ["..."],
  "intrinsic_quality": 78,
  "synonyms": ["whole milk solids"]
}
```

- Script: `pnpm rate:ingredients` → `scripts/rate-ingredients.ts`
- Model: local Qwen 7B via LM Studio (same stack as label OCR)
- Batch 8–16 names per call; validate JSON schema; retry on failure

### 4.2 Product aggregation (Phase 3, uses Phase 2 data)

```
ingredient_quality = Σ (intrinsic_quality_i × position_weight_i) / Σ weight
position_weight_i = exp(-i / 3)
```

Penalties: concern tiers, NOVA-4 share > 40%, hazardous hard-cap.

---

## 5. UX (Phase 5)

- Headline: **Final score + grade + verdict title**
- Up to **3 sublabel chips**
- One line: “Better than X% of {cohort}” (when `cohort_size ≥ 8`)
- PDP default: **per serving** nutrition; toggle per 100g
- **Adjuncts remain in grid** — no hide filter

---

## 6. Migration phases

### Phase 1 — Foundations ✅ (implementing)

- [x] `data/category-servings.json`
- [x] `lib/scoring/serving.ts` — `resolveServingGrams`, `attachPerServeNutrition`
- [x] `lib/scoring/role-cohort.ts`
- [x] `lib/scoring/verdict.ts` + `lib/scoring/sublabels.ts` (rules + `pickVerdictSublabels`; micronutrient / serving-size chips stubbed until Phase 3 label data)
- [x] `lib/scoring/per-serve.ts` — read per-serve from `nutrition.extra`
- [x] Migration `0008_scoring_v9_foundations.sql`
- [x] `scripts/backfill-per-serve-nutrition.ts`
- [x] Types extended in `lib/supabase/types.ts`

### Phase 2 — LLM ingredient pre-score ✅ (implementing)

- [x] `lib/scoring/ingredient-llm.ts`
- [x] `lib/scoring/normalize-ingredient-name.ts`
- [x] `lib/scoring/ingredient-normalize.ts` — compound expand + alias map (used by rater + lookup)
- [x] `lib/scoring/ingredient-lookup.ts` — map product ingredients → cached rows
- [x] `scripts/rate-ingredients.ts`
- [x] `pnpm rate:ingredients` in package.json

### Phase 3 — New scoring engine (parallel V8/V9) ✅ (implementing)

**Required:** run V9 alongside V8 on ~500 SKUs; diff report before cutover.

- [x] `lib/scoring/absolute.ts`
- [x] `lib/scoring/relative.ts`
- [x] `lib/scoring/core-v9.ts` → `computeCoreScoreV9`
- [x] `lib/scoring/v9-batch.ts` — cohort preload + ingredient cache
- [x] `scripts/score-v9-diff.ts` — side-by-side V8 vs V9 + cohort sanity (masala, tea, dahi, cola, biscuit)
- [x] Env flag `SCORING_ENGINE=v9` (+ `SCORING_RULE_VERSION=9`) in `persist-core.ts`
- [ ] Bump production cutover after diff sign-off (`pnpm score:v9:diff` then `SCORING_ENGINE=v9 pnpm score -- --force`)

### Phase 4 — Goal fit refactor

- Weight matrix on `per_serve_*` + ingredient intelligence
- Goal-contextualized sublabels (schema already reserved)

### Phase 5 — UI (partial)

- [x] Verdict badge + sublabel chips on catalog card and PDP (`components/verdict-chips.tsx`)
- [x] Cohort percentile line when `cohort_size ≥ 8`
- [x] Per-serving nutrition default on PDP (`NutritionTable` toggle, defaults to per serving when available)
- [ ] Three dials (nutrition / ingredient / labels)

### Phase 6 — Cleanup

- Retire most `baselines.ts` category caps
- Keep `rules.ts` for hazardous hard-cap only
- Remove `ingredient-signals.ts` regex sieve

---

## 7. Open decisions

| Topic | Decision |
|--------|----------|
| Blend ratio 55/45 | Tune after V8/V9 diff on 50 borderline SKUs |
| Adjunct visibility | **Keep visible** — no catalog hide |
| Cohort coldstart | `relative = absolute` when `cohort_size < 8` |
| RDA micronutrients | Phase 3: map `% RDA` from label when present; else skip micronutrient sublabels |

---

## 8. Commands

```bash
pnpm db:migrate                              # applies 0008
pnpm backfill:per-serve                      # Phase 1
pnpm rate:ingredients -- --limit=100         # Phase 2 pilot
pnpm rate:ingredients -- --all --batch-size=4 --debug   # overnight (one-by-one fallback)
# Phase 3 (later):
pnpm score:v9:diff -- --limit=500
pnpm score -- --force                        # after cutover
```

## 9. Ingredient rating model (global cache)

Ingredients are **not** rated per product. They are rated **per normalized name**, once, in `ingredient_intelligence`:

1. Every `ingredients_raw` → split / expand compounds (`ingredient-normalize.ts`) → unique names (~23k).
2. `pnpm rate:ingredients` calls LM in batches; upserts on `normalized_name` (primary key).
3. At V9 score time, each product **looks up** the same rows for its ingredient list and aggregates with position weights (`ingredient-quality.ts`).
4. Unrated names fall back to regex `ingredient-rules.json` until the overnight pass covers them.

The live site still uses **V8 scores** and regex in the ingredient panel until cutover (see [site-improvements.md](./site-improvements.md)).

---

## 10. LM Studio operations (local)

Two heavy jobs share one Qwen instance — **do not run both at full speed without a lock**.

| Job | Command | Notes |
|-----|---------|--------|
| OCR + structure | `pnpm ocr:lm -- --limit=2000 --resume --persist-db` | Livetext OCR + conditional LM |
| Ingredient rater | `pnpm rate:ingredients -- --all --batch-size=4` | Pre-split via `ingredient-normalize.ts` |

- **`lib/lm/studio-lock.ts`** — file lock so only one job hits LM Studio at a time (restart jobs to pick up).
- **`lib/ocr/format-ingredients.ts`** — repair `}`, quotes, `;` splits, bracket-aware segments.
- **`pnpm lm:status`** — process list + DB/jsonl progress.
- **LM Studio context (ingredient rater):** set **8192** on the Qwen model used for `rate:ingredients` (not 39k). OCR label jobs may need a separate model load at **16k+** context.

**Recommended overnight:** finish or pause one job, then run the other with lock. Or run `rate:ingredients` after `ocr:lm` completes.

```bash
pnpm lm:status
tail -f /tmp/oasis-ocr-lm-2k.log
```

**Parallel site work:** [site-improvements.md](./site-improvements.md) — PDP, catalog, and cutover tasks while LM jobs run.
```

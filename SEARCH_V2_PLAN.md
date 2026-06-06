# Scout Search — SOTA Spec (Definitive, LLM-First)

> Scout is a **nutrition decision engine**, not a grocery catalog.
> **North star — answer "What should I buy?", not "What products match this query?"** The recommendation
> layer is the primary moat; decision support is the differentiator.

---

## 0. Governing principles (read these first)

1. **Intelligence is LLM/embedding-driven; serving is deterministic — and these are not in tension.**
   All *understanding and judgment* — intent parsing, product type, flavour/variant, every non-numeric trait,
   dietary inference, synonym/semantic matching, goal decomposition, query generalization, variant clustering
   — is produced by an **LLM or by embedding similarity**. Determinism is reserved for exactly two
   **non-linguistic** things: **(a) set-membership filters over fields the LLM already extracted**, and
   **(b) scoring math** (weighted sums, normalization, percentiles, RRF). Determinism is **never** used to
   *understand language*.

2. **Zero language rules. This is a hard constraint.** The following are **spec violations**, not allowed
   optimizations: regex/keyword parsers as the primary path, keyword lexicons, **synonym maps**,
   **head-noun rules**, **atomic-compound lists**, hand-maintained **category→trait** or **goal→trait** or
   **type-hierarchy** tables. Wherever earlier drafts implied a lookup table, it is replaced by an LLM call or
   embedding similarity. The only hand-authored artifact permitted is the **finite trait vocabulary** (§3a)
   and the eval set (§15).

3. **Filters decide membership; ranking decides order.** A product that violates a stated requirement is
   removed by a filter over an LLM-extracted field — never merely out-ranked, never injected by a vector.

4. **Goals are infinite; traits are finite.** We precompute a finite trait vector per product and compose any
   goal as a weighting over traits at query time. The flow is always:
   `Goal → Trait weights → Candidate generation → Ranking → Recommendation`.

5. **Cost is controlled by batching + caching + model tiering, not by avoiding the LLM.** DeepSeek v4-flash's
   context fits many products per enrichment call; query parses are reused via semantic cache; a fast model
   handles the common case and a strong model the hard case. Cheapness is never a reason to fall back to rules.

6. **Trustworthiness > recall.** Never a confident recommendation from low-confidence data.

```
DIRECTED  query → LLM Intent → Candidate Gen (filter on enriched fields) → Hybrid retrieve → Health-aware rank
VAGUE/goal query → LLM Intent → Goal→Traits (Nutrition Graph) → Candidate Gen (trait-profile) → rank → Buckets
Funnel: ~23k products → ~500 candidates → ~50 reranked → ~10 shown
```

---

## 1. Architecture: LLM intelligence OFFLINE, fast reasoning ONLINE

The hot path is fast **because the LLM already did the hard understanding offline**, not because it uses
rules. Three layers:

- **(L1) Offline LLM enrichment** — batched DeepSeek v4-flash turns messy labels into a clean
  `product_search_index` row (semantic facets + traits + confidences). This is where intelligence is baked.
- **(L2) Embedding layer** — every product, every canonical type, every goal, and every category-trait
  profile lives in vector space. *All* semantic matching (type synonyms, goal "hits", category selection,
  query generalization, variant clustering) is **cosine similarity**, never a lookup table.
- **(L3) Online understanding** — each query is parsed by an LLM into structured intent; a **semantic cache**
  makes repeats/near-repeats free. Serving (filter + math) runs over L1/L2 output.

```
 OFFLINE (batched DeepSeek v4-flash + embeddings + deterministic math)
   raw: name·category·subcategory·L3·attributes·nutrition·ingredients·allergens·usage
     │  L1 LLM enrichment (semantic facets, non-numeric traits, base_name, dietary, brand_tier, confidences)
     │  + deterministic math (quantitative traits, tiers, data_quality_score)
     │  + L2 embeddings (product, type, category-profile vectors)
     ▼  product_search_index  (single source of truth)  +  goal_trait_map (Nutrition Graph)  +  category_trait_profile
 ONLINE → §6
```

---

## 2. Ground truth (verified on the live catalog)

| Finding | Consequence |
|---|---|
| **22,841 products / 9,917 catalog-visible** | enrichment is batched, resumable, per-category runnable |
| **No `Flavour` attribute; no `smoothie` subcategory** (smoothies span 4 subcats) | type & flavour are **LLM-extracted from the name**, never inferred by a rule on subcategory |
| **Correct sets can be tiny** (2 strawberry smoothies) | precision-first; padding with wrong items is the bug |
| **Rich signals already in `attributes`** (`Label Allergens`, `Marketing Claims`, `L3`, DeepSeek confidences) + full `nutrition` + `core_scores` | feed enrichment & confidences; don't re-extract what exists |
| **Coverage/OCR quality uneven** | `data_quality_score` mandatory; low-quality hidden/badged |

---

## 3. The trait engine

### 3a. The finite trait vocabulary (the ONE hand-authored list, ≈25)

The vocabulary is fixed; the per-product *values* are computed (math or LLM, never keyword rules).

```
QUANTITATIVE (deterministic MATH over verified numbers — arithmetic, not language rules)
  protein_density · fiber_density · low_sugar · low_sodium · low_fat · low_saturated_fat ·
  healthy_fats · low_calorie_density · calcium_rich · no_added_sugar
SEMANTIC / FUNCTIONAL (LLM judgment, offline, from name+category+ingredients+usage+claims)
  hydration · electrolytes · satiety · gut_health · slow_energy · quick_energy · antioxidant ·
  whole_food · clean_label · processing_level · kid_friendly · diabetic_friendly ·
  gym_friendly · elderly_friendly
```

**Trait value computation (pinned):**
- **Quantitative traits** = a monotonic transform of the real nutrition number, normalized to **0–1 by
  percentile rank within the product's `primary_type`** (e.g. `low_sugar` = 1 − sugar-percentile among
  smoothies). This is exact math, fully trustworthy, no tokens. `null` if the underlying number is absent.
- **Semantic traits** = emitted by the LLM **per product** as `{value: 0–1, confidence: 0–1, reason: string}`,
  reasoning over the *whole* label (name, ingredients, usage, claims, category). The numeric signals are
  given to the LLM as context, but the LLM produces the judgment — there is no hardcoded
  "beverage⇒hydration=0.8" rule. `null` (not 0) when undeterminable.
- Provenance in `trait_source` (`math`|`llm`); confidence in `trait_confidence`.

### 3b. The Nutrition Graph — goals → trait weights (LLM-composed, embedding-keyed)

`goal_trait_map` stores `goal_phrase, goal_embedding, weights jsonb (trait→weight), source, support_count`.

- **Resolution (pinned):** embed the parsed goal phrase → if `cosine ≥ 0.92` to a stored goal, **reuse its
  weights** (no LLM call). Else the **LLM decomposes** the goal into a weight vector **over the fixed trait
  vocabulary only** (unknown traits dropped, weights renormalized to sum 1), with a one-line reason per
  non-zero trait (powers explainability §7d). Persist the new mapping with its embedding.
- **Seed (bootstrap only, ~10 goals)** so day-1 isn't cold; everything else is learned:
  ```
  running  → hydration .35 · electrolytes .30 · slow_energy .15 · low_sugar .10 · whole_food .10
  diabetes → fiber_density .30 · low_sugar .30 · satiety .20 · whole_food .10 · low_sodium .10
  PCOS     → fiber_density .30 · low_sugar .30 · whole_food .20 · low_calorie_density .10 · clean_label .10
  ```
- **The graph is learning, never hand-maintained.** We never add `running, cycling, swimming…` by hand. New
  goals enter via LLM decomposition; weights are refined by behavior (§10). The embedding key means
  "for my morning jog" matches "running" without any string rule.
- **`goal_fit(p) = Σ weight_i · effective_trait_score_i(p)`** (§3c).

### 3c. Confidence & provenance discount scoring

LLM-emitted `trait_confidence` is **calibrated against the eval set** (reliability curve) before use — raw
self-reported confidence is never trusted directly. Then:

```
effective_trait_score = trait_value × min(data_quality_score, calibrated_trait_confidence)
```
Quantitative traits use `data_quality_score` alone (no LLM confidence term). `goal_fit` and buckets use
`effective_trait_score`, never the raw value. A confident "Best Protein" pick therefore requires confident
protein data — **trustworthiness > recall**.

---

## 4. `product_search_index` (offline-built source of truth)

```sql
product_search_index (
  product_id uuid pk, canonical_product_id uuid,        -- §8 (embedding-clustered)
  -- TYPE / MODIFIERS  (LLM-extracted from the name; NO head-noun rule, NO atomic list)
  primary_type text, base_name text, form text, flavours text[], variants text[],
  type_embedding vector(N),                              -- for semantic type matching (replaces synonym map)
  -- DIETARY / ALLERGENS / CLAIMS  (LLM inference + existing attributes)
  is_veg bool, is_vegan bool, is_gluten_free bool, is_jain bool, is_palm_oil_free bool, has_added_sugar bool,
  allergens text[], claims text[],
  -- NUTRITION + percentile tiers (deterministic)
  sugar_g numeric, protein_g numeric, fat_g numeric, sodium_mg numeric, energy_kcal numeric, price_inr numeric,
  sugar_tier text, protein_tier text, fat_tier text,
  -- TRAITS  (§3) — value + provenance + confidence
  traits jsonb, trait_source jsonb, trait_confidence jsonb,
  -- HEALTH / TRUST
  scout_score numeric, nova_group int,
  data_quality_score numeric, data_completeness numeric, facet_confidence jsonb,
  -- INDIA
  brand_tier text, pack_size_value numeric, pack_size_unit text,
  -- SEARCH ASSETS
  use_cases text[], search_doc text, embedding vector(N),  -- product doc embedding
  -- POPULARITY (§10)
  click_count int default 0, save_count int default 0, last_interaction_at timestamptz
)
category_trait_profile (category text pk, trait_means jsonb, trait_centroid vector(N), product_count int)
goal_trait_map (goal_phrase text, goal_embedding vector(N), weights jsonb, source text, support_count int)
```

**Offline enrichment (batched DeepSeek v4-flash, ~20–40 products/call):** for each product, one structured
JSON object → `primary_type, base_name, form, flavours, variants, dietary flags, semantic traits {value,
confidence,reason}, use_cases, brand_tier, facet_confidence`. Quantitative traits, tiers, `data_quality_score`,
embeddings, and `category_trait_profile` are computed deterministically afterward. Per-category runnable;
re-enrich on source-hash change.

---

## 5. `data_quality_score` (pinned)

```
data_quality_score = 0.40·completeness + 0.30·ocr_confidence + 0.30·consistency      (each 0–1)
  completeness   = fraction of {name, category, nutrition, ingredients, allergens} present
  ocr_confidence = mean of attributes.DeepSeek *Confidence (default 0.5 if absent)
  consistency    = 1 − normalized max anomaly severity from lib/nutrition/anomaly.ts
```
- `< 0.50` → **hidden by default** (or "label not verified" badge if explicitly surfaced).
- `0.50–0.75` → shown with a caution badge.
- `≥ 0.75` → eligible for **"Verified by Scout"**.
- Thresholds are defaults, **tuned by the eval set**, never silently bypassed. Traits over absent data are
  `null`, not 0.

---

## 6. Online pipeline (the funnel, pinned)

```
query
 └▶ (L3) LLM INTENT — fast model (Groq) default → { kind, goal, primary_type, flavours, constraints (each
      with a priority rank), dietary, sort, intent_confidence }. Semantic cache: embed query; cosine ≥ 0.97
      to a cached parse (same prefs) ⇒ reuse, 0 calls. Escalate to DeepSeek when intent_confidence < 0.6 OR
      ≥2 simultaneous constraints. (LLM is the DEFAULT, not a fallback.)
      │  goal/vague → GOAL→TRAITS via Nutrition Graph (§3b)
      ▼
 ① CANDIDATE GENERATION (~23k → ~500) — membership only, over LLM-extracted fields:
      directed: primary_type matches (exact OR type_embedding cosine ≥ 0.85 — semantic, no synonym table)
                · flavours ⊇ required · dietary · allergen-free · nutrition tier/threshold · data_quality gate
      goal:     select top-K=8 categories by cosine(goal_weight_vector, category_trait_centroid) ≥ 0.5,
                then the same hard filters within them
      truncate to 500 by the hybrid retrieval score (②'s score), keeping all exact-type matches first
      ▼
 ② HYBRID RETRIEVE / RERANK (~500 → ~50) — RRF(structured/lexical, vector), k=60, equal weight (tuned by eval).
      Structured-first: lexical (Postgres FTS/trigram on search_doc) + vector (query embedding) fused; vector
      may reorder/expand WITHIN ① only — it can never add an off-filter product.
      ▼
 ③ RANK (~50 → ~10) — directed: §7b formula · goal: goal_fit + health → BUCKETS (§7c) with reasons (§7d)
      ▼
 ④ RELAX if <3 (§11, LLM/embedding generalization, always explained) → results + structured "why"
```

**LLM verification net (optional, ② or ③):** when precision is at risk, one batched Groq call over the top
~20 ("is each a {type} that is {flavours}? text only") removes survivors that slipped through; non-blocking.

---

## 7. Retrieval & ranking (pinned math)

### 7a. Hybrid retrieval — structured-first, semantic everywhere
Membership comes from **filters on LLM-enriched structured fields**. Type **synonymy is embeddings**
(`type_embedding` cosine), not a map — "soda≈soft drink≈cola" emerges from vector space. Lexical + vector are
fused by **RRF (k=60)**; vectors handle fuzziness/typos/Hindi and sparse recovery but never breach §0.3.

### 7b. Health-aware ranking (directed). Each component min-max normalized to [0,1] within the candidate set, then:
```
score = 0.40·relevance + 0.30·health + 0.20·trait_match + 0.10·popularity
  relevance   = RRF hybrid score
  health      = scout_score/100
  trait_match = goal_fit if a goal/health_context exists, else fraction of stated constraints satisfied
  popularity  = time-decayed CTR (§10)
directed query with NO goal/constraints → reweight 0.55·relevance + 0.35·health + 0.10·popularity
```
Health must materially move ranking (≥30%). `relative` nutrition ("high protein milk") uses per-type tiers.

### 7c. Recommendation buckets (goal queries) — LLM/trait-derived, not hand-listed
Buckets = **Best Overall** (goal_fit·health) + **Best Budget** (goal_fit per ₹/100g) + one bucket per the
**top-3 traits by goal weight** (e.g. running→Hydration, Endurance, Recovery), each surfacing the top
products on that trait. 3–5 items/bucket; a product may repeat across buckets (labeled). Bucket names come
from the goal's dominant traits, so they're infinite/automatic.

### 7d. Explainability — every pick carries structured, confidence-gated reasons
Each recommendation ships `[(trait, contribution, reason)]` drawn from the traits/health/goal alignment that
earned it (e.g. coconut water → "High hydration · Natural electrolytes · Low added sugar · Strong endurance
match"). Reasons are generated from the trait math + LLM trait reasons, never hand-written, and are
suppressed when `effective_trait_score` is low (no citing a trait we can't stand behind).

---

## 8. Canonical clustering (embedding-based, no regex)
The LLM extracts `base_name` (variant/size stripped) during enrichment. Products are clustered into
`canonical_product_id` by **base_name + brand embedding proximity** (cosine), not a regex that strips "90g".
Representative = highest `data_quality_score`. Search shows one; expand on click.

---

## 9. Model orchestration (LLM-first; cost via batching/caching/tiering)
- **Offline enrichment & trait inference:** DeepSeek v4-flash, **batched** (20–40 products/call).
- **Query intent:** Groq fast model **by default**; **escalate to DeepSeek** on `intent_confidence < 0.6` or
  ≥2 constraints. Reused via semantic cache (cosine ≥ 0.97).
- **Goal decomposition:** LLM, cached in the Nutrition Graph by goal embedding (cosine ≥ 0.92).
- **Verification:** Groq, batched ~20, only when precision is at risk; non-blocking.
- **Embeddings:** load-bearing (type synonymy, goal hits, category selection, clustering, relaxation, hybrid
  retrieval). *Prerequisite: pick the provider (recommend a multilingual model, e.g. Voyage/E5) — required
  before the semantic layers ship.*
- **Degradation ladder (fallback only, never the primary path):** LLM down → a minimal heuristic parse keeps
  search alive; vector down → structured-only; all down → lexical over `search_doc`. Filters always hold.

---

## 10. Popularity — safe by design
Track `click_count, save_count` → time-decayed CTR feeding the 10% term (§7b).
- **Time decay (pinned):** exponential, 30-day half-life. Recent interactions dominate; stale winners fade.
- **Exploration (~5% of queries):** randomly promote one top-set candidate into the shown results and measure
  CTR/saves — discovers strong products ranking would suppress.
- **Cold start `new_product_boost`:** first **14 days**, popularity weight ≈0 and rank is driven by
  relevance/health/trait quality; boost decays linearly to 0. New strong products surface, not buried.

---

## 11. Relaxation (LLM/embedding generalization, always explained)
If membership < 3: the LLM (with embedding neighbors as candidates) proposes the next-broader intent by
relaxing the **lowest-priority constraint first** (priority comes from the parse, §6) — e.g.
"high protein snacks" → "protein snacks" → "protein foods" — using embedding-nearest broader types, **not a
hierarchy table**. `primary_type` and required flavours are never relaxed. A banner states exactly what
changed and why.

---

## 12. India-specific (semantic, not rule-based)
- `brand_tier` (national/regional/local) — LLM-inferred during enrichment.
- `pack_size` — LLM-extracted ("500gm", "1 L") → powers ₹/100g value and clustering.
- Variants (salted/masala/spicy/tomato/family pack) — LLM-extracted into `variants`/`flavours`.
- **Multilingual** — a multilingual embedding model means Hindi/Hinglish ("doodh", "bina cheeni") lands near
  meaning **without a synonym/translation table**; the LLM intent parser handles EN+HI negation natively.

---

## 13. Premium / retention (after core search; phased)
- **Phase 1 (value + subscription):** Saved Searches · Alerts · **"Verified by Scout"** badge (§5).
- **Phase 2:** further trust features.
- **Phase 3:** health tracking/history (retention; must not distract from search quality — last).

---

## 14. Every query type → handling (all LLM/embedding understanding)

| Type | Example | Mechanism |
|---|---|---|
| Brand | `amul` | brand filter, health rank |
| Type | `namkeen` | enriched `primary_type` (+ type_embedding) filter, health rank |
| Type + flavour | `strawberry smoothie` | type filter + `flavours⊇[strawberry]` + verify |
| Type + abs/rel nutrition | `biscuits under 5g sugar` / `high protein milk` | `sugar_g≤5` / `protein_tier='high'` |
| Type + negation/dietary/allergen | `peanut butter no palm oil`, `nut-free X` | `is_palm_oil_free` / allergen exclude |
| Health context | `biscuits for diabetics` | diabetic traits rank |
| **Goal/vague** | `healthy drinks for running` | **goal→traits → category-profile → buckets** |
| Use-case | `pre-workout snack` | trait weights + `use_cases` |
| Superlative/sort/comparison | `healthiest oats`, `healthier than maggi` | sort_intent / resolve ref → higher scout_score |
| Multi-constraint | `strawberry smoothie low sugar no preservatives` | all filters ANDed + relax |
| Misspelling / Hinglish | `smoothei`, `bina cheeni doodh` | LLM parse + multilingual embedding (no fuzzy rules) |
| Vague NL | `tiffin stuff that isn't junk` | goal route (clean_label/whole_food/kid_friendly traits) |
| Word-order | `chocolate milk` vs `milk chocolate` | LLM understands → opposite `primary_type` (no head-noun rule) |

---

## 15. Evaluation harness (merge gate)
`eval/search-cases.json` (~60 cases across every query type × category) →
`{must_include[], must_exclude[], expected_top1?, expected_buckets?}`; `scripts/eval-search.ts` runs the live
pipeline. Metrics: **forbidden-leak rate = 0 (hard gate)**, precision@5 ≥ 0.8, top-1 accuracy, goal-bucket
sanity, latency, LLM calls/search. **Also produces the `trait_confidence` calibration curve (§3c).** Seed
from §14 + real `search_history`. No search change ships unless leak-rate = 0.

---

## 16. Build order
1. **Index + enrichment (L1+math)** — schema; batched DeepSeek enrichment (semantic facets + traits + base_name
   + brand_tier + confidences); deterministic quantitative traits, tiers, `data_quality_score`. Per-category.
2. **Embedding layer (L2)** — provider chosen; product/type/category-centroid embeddings; pgvector + indexes.
3. **Nutrition Graph + goal engine** — `goal_trait_map` (embedding-keyed, LLM-composed), `goal_fit` over
   `effective_trait_score`.
4. **Online intent (L3)** — LLM parser (fast→DeepSeek escalation) + semantic cache; no rule parser as primary.
5. **Funnel** — candidate gen (directed filters / goal trait-profile selection) → RRF hybrid rerank →
   health-aware rank (directed) / buckets+explainability (goal) → relaxation.
6. **Verification net + popularity loop + clustering UI.**
7. **Eval harness** — leak-rate=0 gate + confidence calibration.
8. **Premium (§13).**

---

## 17. Non-negotiables
- **Zero language rules** — no lexicons, synonym maps, head-noun rules, atomic-compound lists, or
  hand-maintained category/goal/type-hierarchy tables. Understanding is LLM or embedding, always.
- **Intelligence LLM-generated, serving deterministic** — determinism only for membership filters + math.
- **LLM is the default path, not a fallback**; heuristics exist only for outage degradation.
- **Cost via batching + semantic cache + model tiering** — never by avoiding the LLM.
- **Filters decide membership; scores decide order**; vectors never inject off-filter products.
- **Goals infinite, traits finite**; the Nutrition Graph learns, never hand-grown.
- **Confidence discounts scoring**; trustworthiness > recall; calibrate LLM confidence via eval.
- **Health ≥30% of ranking**; every recommendation is explainable; relaxation always explained.
- **Answer "what should I buy?", not "what matches?"**

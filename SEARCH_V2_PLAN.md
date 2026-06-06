# Scout Search — SOTA Spec (Definitive)

> Scout is a **nutrition decision engine**, not a grocery catalog.
>
> **North star — search results must answer "What should I buy?", not "What products match this query?"**
>
> It must be SOTA on **vague/goal queries** ("healthy drinks for running") *and* razor-precise on
> **directed queries** ("strawberry smoothie no added sugar"). Never a contradiction, never silent data
> loss, never "generic keyword search."

---

## 0. Two principles that govern everything

1. **Filters decide membership; ranking decides order.** A product that violates a stated requirement is
   *removed by a filter* — never merely out-ranked. Embeddings/LLM never inject an off-type product.
2. **Goals are infinite; traits are finite.** We never precompute goals. We precompute a finite set of
   reusable **traits** per product, and at query time we **compose any goal as a weighting over traits.**
   New goals (“drinks for running”, “snacks for night shift”) emerge automatically — no new data, no new code.

```
DIRECTED query → Intent → Candidate Generation → Retrieve (filter+hybrid) → Rank (health-aware)
VAGUE/goal query → Intent → Goal→Traits (Nutrition Graph) → Candidate Generation → Retrieve → Rank → Buckets

Funnel (the architecture every serious search converges to):
   ~23k products → ~500 candidates → ~50 reranked → ~10 shown
```

---

## 1. The big idea: intelligence OFFLINE, reasoning at QUERY TIME

Today everything (type-guessing, flavour-guessing, ingredient scanning, health judging) happens *per search*
— slow, costly, unreliable. SOTA inverts it:

- **Offline (once per product, re-run on change):** turn messy labels into a clean **`product_search_index`**
  row: canonical type, flavours/variants, dietary flags, allergens, claims, **a finite trait vector**,
  health score, **a data-quality score**, India facets (brand tier, pack size, variant), and a semantic
  embedding.
- **Online (per search):** understand intent → (directed) filter+rank, or (goal) map goal→trait-weights and
  score → curated buckets. Fast, mostly deterministic, LLM only when genuinely needed.

```
        OFFLINE  (DeepSeek/Groq enrichment + deterministic computation)
 raw product: name·category·subcategory·L3·attributes·nutrition·ingredients·allergens·usage
        │
        ▼  product_search_index  (one row/product, the single source of truth for search)
        │   canonical type · flavours[] · variants[] · form · dietary · allergens[] · claims[]
        │   TRAIT VECTOR (finite, 0–1) · nutrition + per-category tiers · scout_score · nova
        │   data_quality_score · brand_tier · pack_size · canonical_product_id · use_cases[]
        │   search_doc (lexical) · embedding (semantic) · per-facet confidence
        ▼
        ONLINE  → see §6
```

---

## 2. Ground truth (verified on the live catalog)

| Finding | Consequence |
|---|---|
| **22,841 products / 9,917 catalog-visible** | enrichment is batched, resumable, **per-category runnable** |
| **No `Flavour` attribute** (0/15 smoothies) | flavour from the **name** → extract offline into `flavours[]` |
| **No `smoothie` subcategory** (15 smoothies span 4 subcats) | product type is **name-driven** → `primary_type` |
| **Correct sets can be tiny** (2 strawberry smoothies) | precision-first; careful relaxation; padding = the bug |
| **Rich signals already present** in `attributes` (`Label Allergens`, `Marketing Claims`, `L3 Category`, DeepSeek confidences) + full `nutrition` + `core_scores` | **don't re-extract what exists**; enrich only the LLM-hard gaps |
| **Coverage uneven**, OCR quality varies | **`data_quality_score`** is mandatory; low-quality items hidden/marked |

---

## 3. The TRAIT engine (the core of the moat)

### 3a. Finite trait vocabulary (precomputed per product, normalized 0–1)

Traits are *reusable nutritional/functional properties*, not goals. Each is derived deterministically from
nutrition/NOVA where possible, and inferred by LLM only where it must be (e.g. `kid_friendly`).

```
NUTRITIONAL   protein_density · fiber_density · low_sugar · low_sodium · low_fat ·
              low_saturated_fat · healthy_fats · low_calorie_density · whole_food
FUNCTIONAL    hydration · electrolytes · satiety · gut_health · slow_energy(complex carbs) ·
              quick_energy · antioxidant · calcium_rich
PROCESSING    processing_level(NOVA-inverted) · clean_label(additive-free) · no_added_sugar
AUDIENCE      kid_friendly · diabetic_friendly · gym_friendly · elderly_friendly
```
This set is **finite and curated** (≈25). Provenance per trait stored in `trait_source` (`derived` vs
`llm`) and gated by `data_quality_score` — a trait computed from missing data is null, not 0.

### 3b. The Nutrition Graph — goals map to trait weights (stored explicitly)

A goal is a **weight vector over the finite traits**. These mappings are stored explicitly as a persistent
**Nutrition Graph** (`goal_trait_map` table: `goal → {trait: weight}`), seeded with common goals:

```
running  → hydration .35 · electrolytes .30 · slow_energy .15 · low_sugar .10 · whole_food .10
PCOS     → fiber .30 · low_sugar .30 · whole_food .20 · low_calorie_density .10 · clean_label .10
diabetes → fiber .30 · low_sugar .30 · satiety .20 · whole_food .10 · low_sodium .10
muscle gain → protein_density .45 · calorie adequacy .20 · whole_food .15 · clean_label .10 · …
kids tiffin → kid_friendly .30 · clean_label .25 · low_sugar .20 · calcium .15 · whole_food .10
```

`goal_fit(product) = Σ weight_i · trait_i`. New goals need **zero** new data — they just compose existing
traits. Storing the graph explicitly means: **recommendations are explainable** (we can show *which* traits
earned a pick), **decomposition is consistent** (same goal → same weights every time), and **LLM dependence
drops** (a graph hit needs no model call).

> **The curated goal map is only a bootstrap layer.** The system must *progressively learn* new goal→trait
> mappings — from user behavior (clicks/saves on what the LLM proposed) and from LLM decomposition of novel
> goals (which, once validated, are written back into the graph) — rather than relying on an ever-growing
> manually maintained goal list. We never hand-add `running, cycling, swimming, trekking, …` one by one; the
> trait model + graph learning is precisely what prevents that. The graph grows itself.

Resolution order for any goal: **graph hit → (miss) LLM decomposition bounded to known traits → persist the
validated mapping back into the graph.** Over time, fewer misses, fewer LLM calls.

---

## 4. `product_search_index` (offline-built source of truth)

```sql
product_search_index (
  product_id uuid pk, canonical_product_id uuid,   -- §8 clustering
  -- TYPE / MODIFIERS  (name-driven, LLM-normalized)
  primary_type text, type_aliases text[], form text,
  flavours text[], variants text[],                -- variants incl. India: salted/masala/spicy/tomato/family pack
  -- DIETARY / ALLERGENS / CLAIMS  (mostly from existing attributes)
  is_veg bool, is_vegan bool, is_gluten_free bool, is_jain bool, is_palm_oil_free bool, has_added_sugar bool,
  allergens text[], claims text[],
  -- NUTRITION + relative tiers (per primary_type percentiles, deterministic)
  sugar_g numeric, protein_g numeric, fat_g numeric, sodium_mg numeric, energy_kcal numeric, price_inr numeric,
  sugar_tier text, protein_tier text, fat_tier text,
  -- TRAITS  (§3) — the reasoning substrate
  traits jsonb,            -- { hydration:0.8, protein_density:0.2, ... }  (0–1, null if undeterminable)
  trait_source jsonb,      -- { hydration:"derived", kid_friendly:"llm" }
  -- HEALTH
  scout_score numeric, nova_group int,
  -- TRUST  (§5)
  data_quality_score numeric,    -- 0–1 : OCR confidence · completeness · consistency
  data_completeness numeric, facet_confidence jsonb,
  -- INDIA  (§12)
  brand_tier text,         -- national | regional | local
  pack_size_value numeric, pack_size_unit text,
  -- USE / SEARCH ASSETS
  use_cases text[], search_doc text, embedding vector(N),
  -- POPULARITY  (§10, updated online)
  search_count int default 0, click_count int default 0, save_count int default 0
)
```

**What the enrichment LLM actually does** (focused — not re-deriving what exists): `primary_type`,
`flavours`, `variants`, `form`, `use_cases`, the few **LLM-only traits** (`kid_friendly`, etc.), dietary
inference when claims/allergens are silent, and `brand_tier`. Everything else — nutrition tiers, derived
traits, allergens/claims copy-through, scout_score — is **deterministic**, no token spend. Model: DeepSeek
v4-flash for quality (one-time; much label data already extracted), Groq as the cheap/fast option for the
easy extractions; both already wired in the repo.

---

## 5. OCR reality layer — `data_quality_score` (trust = paid-product table stakes)

Per product, combine: OCR/extraction confidence (`attributes.DeepSeek *Confidence`), **completeness**
(how many key fields present: nutrition, ingredients, allergens), and **consistency** (passes
`lib/nutrition/anomaly.ts` checks; macro sum sane; kcal↔macros agree).

- `data_quality_score < threshold` → **hidden by default**, or shown with a visible "label not verified"
  badge (never silently presented as fact).
- Traits/constraints computed from absent data are **null**, not 0 — and the product is down-ranked and
  labeled, never silently dropped or silently trusted.
- High-quality, fully-verified products earn a **"Verified by Scout"** signal (premium, §13).

---

## 6. Online pipeline

```
query
 └▶ INTENT UNDERSTANDING ─ { kind, goal, primary_type, modifiers, constraints, sort, confidence }
      │                     (deterministic heuristic always; LLM only per §9)
      │  goal/vague → GOAL→TRAITS via Nutrition Graph (§3b)
      ▼
   CANDIDATE GENERATION (~23k → ~500) ─ membership filters that CANNOT be wrong:
      type ∈ {type,synonyms} · flavour⊇required · dietary · allergen-free · avoid scan ·
      nutrition threshold/tier · data_quality gate.  (goal route: trait-relevant categories)
      ▼
   RETRIEVE / RERANK (~500 → ~50) ─ hybrid (structured-first + vector expansion, RRF §7a)
      ▼
   RANK (~50 → ~10) ─ directed: health-aware formula §7b · goal: goal_fit + health → BUCKETS §7c
      ▼
   RELAX if sparse (always explained §11) → results + chips + per-pick "why"
```

This is the canonical funnel: **Candidate Generation is its own stage** (membership — the relevance
guarantee), distinct from rerank and final rank. We build it explicitly now even though ~500 fits in memory
today, so the architecture already matches where every serious search system lands.

---

## 7. Retrieval & ranking

### 7a. Hybrid retrieval — **structured-first**
> **Use vectors primarily for intent expansion, semantic matching, and sparse-query recovery — not as the
> primary retrieval mechanism.** For a ~23k catalog, **structured retrieval > vector retrieval** most of the
> time.

- **Structured/lexical is the workhorse:** filter on indexed facets (type, flavour, dietary, nutrition,
  traits) + lexical match on `search_doc`. This is precise and free.
- **Vector is the assistant:** expands intent and recovers matches when the structured pass is sparse or the
  query is vague/typo'd/Hindi. Fused with structured via **Reciprocal Rank Fusion (RRF)** — but **vector can
  only reorder/expand within the filtered membership set; it can never add an off-filter product.**

### 7b. Health-aware ranking formula (directed queries)
> **relevance 40% · health (scout_score) 30% · trait/goal match 20% · popularity 10%.**

Health must *materially* move ranking — otherwise Scout is generic search. Within ties: data-quality, then
sort_intent (cheapest/lowest-sugar/etc.). `relative` nutrition (“high protein milk”) uses per-type tiers, not
absolute thresholds. DeepSeek rerank only on hard multi-constraint cases (§9).

### 7c. Recommendation layer (goal queries — the product moat)
For goal searches, **don't return a flat list — return curated buckets** answering *what to buy*:

```
"healthy drinks for running" →
  Best Overall      (top goal_fit · health)
  Best Hydration    (top hydration trait)
  Best Endurance    (slow_energy · electrolytes)
  Best Recovery     (protein_density · electrolytes)
  Best Budget       (goal_fit per ₹)
```
Bucket definitions are derived from the goal's dominant traits (so they’re also infinite/automatic). Each pick
carries a one-line **"why"** (the traits that earned it). Generic buckets for any goal: *Best Overall, Best
Budget, Best for Diabetics, Best Protein, Cleanest Label.*

---

## 8. Canonical product clustering

Collapse pack-size/flavour variants under `canonical_product_id` so results aren’t flooded with
"Lay’s 20g / 40g / 90g". Search shows **one representative** (best data-quality / most relevant variant);
expand on click to see sizes/flavours/prices. Clustering key = normalized brand + base name + type, computed
offline.

---

## 9. Query-time AI discipline (LLM only when needed)

Most searches resolve **deterministically** (heuristic intent + structured filter + trait scoring). Invoke an
LLM **only when** `intent_confidence < threshold` **OR** `result_count` is very low (needs goal decomposition
or verification). Keeps the hot path fast, free-tier-viable, and reproducible.

- **Intent parse:** heuristic first; Groq `8b-instant` only on low confidence (cached 24h).
- **Goal→trait decomposition:** curated map first; LLM only for novel goals (bounded to known traits).
- **Verification net:** Groq batched, top ~20, only when precision is at risk; non-blocking.
- **Hard rerank:** DeepSeek only for ≥2-constraint directed queries.

Degradation ladder: full → (LLM down) heuristic + structured + traits → (vector down) structured only →
(all down) lexical over `search_doc`. Every tier keeps the type filter; worst case is "precise keyword
search," never random.

---

## 10. Popularity feedback loop

Track `search_count, click_count, save_count` → CTR per product/query. Feeds the 10% popularity term in §7b
and improves continuously from real behavior. Cold-start safe (defaults to 0, health/relevance dominate).

---

## 11. Query relaxation (always explained)

If membership < 3, relax **stepwise** and announce each step: *High Protein Snacks → Protein Snacks →
Protein Foods*; or drop preferred modifiers → loosen numeric one tier → drop unverifiable avoids. **Never
relax `primary_type` or a required flavour.** Banner states exactly what changed and why.

---

## 12. India-specific enhancements

- `brand_tier` ∈ {national, regional, local} — feeds trust/popularity priors.
- `pack_size_value`/`unit` extracted ("500gm", "1 L") — powers value (₹/100g) and clustering.
- **Variant awareness** as flavours/variants: salted, masala, spicy, tomato, family pack, etc.
- **Multilingual** built in: synonym map (doodh→milk, atta→flour), EN+HI negation (`bina cheeni`,
  `cheeni nahi`), multilingual embedding so Hindi lands near meaning.

---

## 13. Premium / retention features (AFTER core search is solved — not core)

Saved searches · product alerts · **"Verified by Scout"** badge (from §5 data-quality) · health
tracking/history. These are retention layers; they ship only once search quality is proven by the eval gate.

---

## 14. Every query type → exact handling

| Type | Example | Mechanism |
|---|---|---|
| Brand | `amul` | brand filter, health rank |
| Type | `namkeen` | type filter, health rank |
| Type + flavour | `strawberry smoothie` | type filter + `flavours⊇[strawberry]` + verify |
| Type + abs nutrition | `biscuits under 5g sugar` | type filter + `sugar_g≤5` |
| Type + rel nutrition | `high protein milk` | type filter + `protein_tier='high'` |
| Type + negation | `peanut butter no palm oil` | type filter + `is_palm_oil_free` + scan |
| Type + dietary/allergen | `vegan / nut-free X` | type filter + flags / allergen exclude |
| Type + health ctx | `biscuits for diabetics` | type filter + diabetic traits rank |
| **Goal/vague** | `healthy drinks for running` | **goal→traits → buckets (§7c)** |
| Use-case | `pre-workout snack` | trait weights (quick_energy/protein) + use_cases |
| Superlative/sort | `healthiest oats`, `cheapest milk` | type filter + sort_intent |
| Comparison | `healthier than maggi` | resolve ref → same type, higher scout_score |
| Multi-constraint | `strawberry smoothie low sugar no preservatives` | all filters ANDed + relax |
| Misspelling / Hinglish | `smoothei`, `bina cheeni doodh` | fuzzy + synonyms + multilingual vector |
| Vague NL | `tiffin stuff that isn't junk` | goal route, traits (clean_label/whole_food/kid_friendly) |
| Ambiguous | `protein` | confidence split → type results + "looking for a goal?" affordance |
| Word-order | `chocolate milk` vs `milk chocolate` | head-noun rule → opposite types |

---

## 15. Evaluation harness — how we *prove* SOTA (merge gate)

`eval/search-cases.json` (~60 cases across **every** query type × category family) →
`{must_include[], must_exclude[], expected_top1?, expected_buckets?}`; `scripts/eval-search.ts` runs the live
pipeline. Metrics: **forbidden-leak rate = 0 (hard gate)**, precision@5 ≥ 0.8, top-1 accuracy,
**goal-bucket sanity** (running query surfaces hydration/electrolyte picks), latency, LLM calls/search.
Seed from §14 + real `search_history`. **No search change ships unless leak-rate = 0.**

---

## 16. Build order

1. **Index + enrichment** — `product_search_index` schema; deterministic computations (nutrition tiers,
   derived traits, allergens/claims copy-through, data_quality_score, brand_tier, pack_size, clustering);
   focused LLM extraction (type/flavours/variants/use_cases/LLM-traits). Per-category runnable.
2. **Intent understanding** — `lib/search/intent.ts`: head-noun, atomic compounds, "with", synonyms,
   negation, fuzzy; heuristic-first, LLM-on-low-confidence; goal extraction.
3. **Nutrition Graph + goal→trait engine** — `goal_trait_map` table (seed common goals), graph-hit →
   bounded LLM decomposition → persist learned mappings; `goal_fit` scorer.
4. **Online pipeline as explicit funnel** — Candidate Generation (membership) → Retrieve/rerank → Rank;
   health-aware rank (directed) + **bucketed recommendations** (goal).
5. **Embeddings** — provider chosen later (parked); structured-first means core ships without it. Add
   pgvector + RRF as the secondary expansion layer.
6. **Verify net + relaxation + clustering UI + popularity loop.**
7. **Eval harness** — leak-rate=0 merge gate.
8. **Premium/retention features (§13).**

---

## 17. Non-negotiables

- **Answer "what should I buy?", not "what matches?"** — recommendation > retrieval.
- **Filters decide membership; scores decide order.** Vectors/LLM never inject off-filter products.
- **Goals infinite, traits finite** — reason over traits, compose goals dynamically.
- **Nutrition Graph is bootstrap + learning, never a hand-maintained goal list.** It grows from behavior +
  validated LLM decomposition; we never add goals one by one.
- **Candidate Generation is a distinct stage** — the funnel (23k→500→50→10) is explicit from day one.
- **Structured retrieval > vector retrieval**; vectors are expansion/recovery, not the engine.
- **Health must materially affect ranking** (30%+), else Scout is generic search.
- **Trust is core:** `data_quality_score` gates visibility; never silently drop or silently trust.
- **LLM only when needed** (low confidence / sparse results); deterministic hot path.
- **Never relax product type or required flavour**; always explain relaxation.
- **Lexicons/traits/synonyms are data; per-query rules are forbidden.**

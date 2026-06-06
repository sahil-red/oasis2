# Scout Search — Best-in-Class Spec (Definitive)

> Search is the make-or-break feature. Goal: **for every kind of query, return only the relevant
> products, ranked by health.** Never a contradiction (no mango smoothie for "strawberry smoothie"),
> never silent data loss, never "decent but random."
>
> Core principle: **filters decide membership, scores decide order.** A product that violates a stated
> requirement is *removed by a filter*, never merely out-ranked. Embeddings/LLM only reorder the relevant
> set (or expand recall when there is no hard requirement).

---

## 0. The one big idea: move intelligence OFFLINE

Today the pipeline tries to understand each product *at query time* — guess its type, find its flavour,
scan its ingredients, judge its nutrition — for every product, on every search. That is slow, costly, and
unreliable.

Best-in-class systems invert this: **enrich each product once into clean, structured facets + a semantic
vector, then serve queries from that clean index.** Query time becomes fast filtering + ranking over data
that is already correct.

```
            OFFLINE (once per product, re-run on change)              ONLINE (per search, fast)
 ┌──────────────────────────────────────────────────┐     ┌────────────────────────────────────┐
 │ raw product:                                       │     │ query                                │
 │  name · category · subcategory · L3 · attributes   │     │   │                                  │
 │  nutrition · ingredients · allergens · usage       │     │ ┌─▼ understand (Groq, cached) ──────┐ │
 │            │  DeepSeek/Groq enrichment             │     │ │ QueryIntent {type, modifiers,     │ │
 │            ▼                                        │     │ │   nutrition, avoid, dietary, sort}│ │
 │  product_search_index:                             │     │ └─┬─────────────────────────────────┘ │
 │   primary_type · flavours[] · variants[] · form    │     │   │                                    │
 │   dietary flags · allergens[] · claims[]           │     │ ┌─▼ FILTER (membership) ─ structured │ │
 │   nutrition + per-category tiers · use_cases[]      │ ──▶ │ │   type, flavour, dietary, allergen, │ │
 │   scout_score · nova · search_doc · embedding       │     │ │   nutrition threshold/tier          │ │
 │   per-facet confidence · data_completeness          │     │ └─┬───────────────────────────────────┘ │
 └──────────────────────────────────────────────────┘     │ ┌─▼ RANK (order) ─ hybrid + business │ │
                                                            │ │   lexical ⊕ vector (RRF) + health   │ │
                                                            │ └─┬───────────────────────────────────┘ │
                                                            │ ┌─▼ VERIFY top-N (Groq, batched) ────┐ │
                                                            │ │   final precision check + chips     │ │
                                                            │ └─┬───────────────────────────────────┘ │
                                                            │ ┌─▼ RELAX if <3, with banner ────────┘ │
                                                            └────────────────────────────────────────┘
```

The LLM does what only an LLM can (understand language, normalize messy labels, verify nuance). Everything
deterministic (filtering, sorting, fusion) stays deterministic — fast, free, reproducible.

---

## 1. Data: ground truth that shapes the design (verified on live catalog)

| Finding | Consequence |
|---|---|
| **No `Flavour` attribute** (0/15 smoothies have one) | flavour comes from the **name** → must be extracted offline into `flavours[]` |
| **No `smoothie` subcategory** (15 smoothies span 4 subcats) | product type is **name-driven** → extracted offline into `primary_type` |
| **Correct sets are tiny** (only 2 strawberry smoothies) | precision-first + careful relaxation; padding with wrong items is the bug |
| **Rich signals exist**: `Marketing Claims`, `Label Free From`, `Label Chips`, `L3 Category`, allergens, usage | feed enrichment → `claims[]`, `dietary`, `use_cases[]`, cleaner type |
| **Coverage uneven** (most items lack full nutrition/ingredients) | per-facet **confidence** + `data_completeness`; missing data → flag + down-rank, never silently drop/include |

---

## 2. Offline enrichment — `product_search_index`

A new table, one row per product, rebuilt when source fields change (hash the inputs; re-enrich on diff).
Populated by a batch script using **all** the fields you listed.

```sql
product_search_index (
  product_id            uuid primary key,
  -- TYPE (the head noun)
  primary_type          text,          -- "smoothie", "peanut butter"  (LLM-normalized)
  type_aliases          text[],        -- ["smoothie","health drink"] for matching
  form                  text,          -- liquid | powder | bar | spread | solid
  -- MODIFIERS
  flavours              text[],        -- ["strawberry"]  (from name)
  variants              text[],        -- ["dark","unsweetened","crunchy"]
  -- DIETARY  (from allergens + ingredients + claims — structured, reliable)
  is_veg, is_vegan, is_gluten_free, is_jain, is_palm_oil_free  boolean,
  has_added_sugar       boolean,
  allergens             text[],        -- normalized: ["milk","nuts","soy","gluten"]
  -- CLAIMS  (from Marketing Claims / Label Free From / Label Chips)
  claims                text[],        -- ["high protein","no added sugar","no preservatives"]
  -- NUTRITION  (numbers + per-category relative tiers, precomputed)
  sugar_g, protein_g, fat_g, sodium_mg, energy_kcal, price  numeric,
  sugar_tier, protein_tier, fat_tier    text,  -- low|medium|high vs OTHERS OF SAME primary_type
  -- HEALTH
  scout_score numeric, nova_group int,
  -- USE CASE  (from usage "use how" + category)
  use_cases             text[],        -- ["breakfast","pre-workout","kids tiffin"]
  -- SEARCH ASSETS
  search_doc            text,          -- rich concatenation, used for lexical (tsvector) match
  embedding             vector(384),   -- dense vector of search_doc (pgvector)
  -- TRUST
  facet_confidence      jsonb,         -- {flavours:0.9, type:0.95, dietary:0.7, ...}
  data_completeness     numeric        -- 0–1: how much real label data backs this row
)
```

**Per-category tiers** (the thing that makes *relative* queries work): compute sugar/protein/fat
percentiles **within each `primary_type`**, store the tertile. So "low sugar smoothie" = `sugar_tier='low'`
among smoothies, and "high protein milk" = `protein_tier='high'` among milks — no hardcoded thresholds, no
treating 3g-protein milk as "not high protein."

**Confidence gating:** if `facet_confidence.flavours < 0.6`, query time falls back to name-substring for
flavour instead of trusting the extracted array. We never blindly trust an extraction.

**Enrichment model:** DeepSeek for the deep one-time extraction (quality matters, cost is one-time and
tiny across a few thousand rows; much is already extracted). Re-enrichment of changed rows only.

**Embeddings:** a free **multilingual** small model (e.g. `multilingual-e5-small` run locally in a script,
or Gemini `text-embedding-004` free tier) so Hindi/Hinglish ("doodh", "bina cheeni") lands near its English
meaning. One-time batch for the catalog; cheap. Stored in pgvector with an HNSW index.

**Coverage / cold-start:** unenriched or new products fall back to name-based type/flavour matching at
query time, and a nightly job enriches the backlog. No product is ever invisible because it lacks a row.

---

## 3. Query understanding → `QueryIntent`

```typescript
type Modifier = { term: string; kind: "flavour"|"variant"|"form"; strength: "required"|"preferred" };

type QueryIntent = {
  raw: string;
  kind: "product" | "brand" | "goal";   // routing
  primary_type: string | null;          // head noun; null for brand/goal
  type_synonyms: string[];               // controlled (§4)
  modifiers: Modifier[];
  brand: string | null;
  nutrition: {                           // deterministic
    max_sugar_g?; min_protein_g?; max_fat_g?; max_sodium_mg?; max_calories?; max_price?;
    relative?: ("low_sugar"|"high_protein"|"low_fat")[];   // → tier sort, not threshold
  };
  avoid: string[];                       // palm oil, maida, preservatives, INS-xxx, added sugar
  must_have: string[];                   // "with chia", "with almonds"
  dietary: ("veg"|"vegan"|"gluten_free"|"jain")[];
  allergen_free: string[];               // "nut free" → exclude allergens:[nuts]
  health_context: string[];             // diabetic, kids, gym, pcos, fat_loss
  use_case: string[];                    // breakfast, pre-workout, tiffin
  sort_intent: "relevance"|"cheapest"|"healthiest"|"highest_protein"|"lowest_sugar";
  confidence: number;
};
```

**Resolution rules** (encoded in parser + verified by tests):
- **Head-noun rule:** in "A B", B is the type, A the modifier — unless "A B" is atomic.
  `chocolate milk` = milk(+choc); `milk chocolate` = chocolate(+milk).
- **Atomic compounds** (never split): peanut butter, ice cream, soft drink, energy drink, green tea,
  protein bar, protein powder, dark chocolate, olive oil, corn flakes, cottage cheese, chia seeds…
- **"with" disambiguation:** `with low sugar`→nutrition; `with strawberry`→flavour; `with chia`→must_have.
- **Negation (EN + HI):** `no/without X`, `bina X`, `X nahi` → avoid / allergen_free. (existing engine)
- **Relative nutrition:** adjective on a low-baseline type → `relative` (tier sort), not absolute threshold.

**Parser stack (degradation-safe):** Groq `llama-3.1-8b-instant` (cached 24h by `normalize(q)+prefsHash`),
merged over a strong **deterministic heuristic** (type lexicon + atomic list + flavour/variant lexicon +
constraint lexicon + synonym map + negation + trigram fuzzy for typos). LLM down ⇒ heuristic still produces
correct compound + negation parsing.

---

## 4. Controlled synonyms (data, not rules; over-expansion is a bug)

```
soft drink → soda, cola, carbonated, fizzy, aerated      namkeen → mixture, sev, bhujia, savoury snack
chips → crisps, wafers                                    biscuit → cookie, cracker (rank exact first)
curd → dahi, yoghurt, yogurt                              atta → flour, wheat flour
milk → doodh        paneer → cottage cheese               ghee → clarified butter
```
Hindi type words map to their English head. **`smoothie` has NO synonym** — never expand to shake/juice
(that leaked mango juice). Embeddings cover the long tail; the synonym map is only for the high-traffic head.

---

## 5. Three routes (don't force a product type)

| `kind` | Trigger | Path |
|---|---|---|
| **product** | head noun present | full filter→rank→verify pipeline |
| **brand** | known brand, no type ("amul") | filter brand → rank by health |
| **goal** | no type, only intent ("something healthy for my diabetic dad") | **vector-first** recall across categories, filter by health_context/dietary, rank by fit |

Brand+type ("amul paneer") = product route + brand filter. Brand+constraint = brand route + numeric filter.

---

## 6. Online pipeline

### 6a. FILTER — membership (deterministic, the relevance guarantee)
Apply as hard SQL/in-memory filters over `product_search_index`:
- **Type:** `primary_type ∈ {type, synonyms}` OR (confidence-gated) name match. *Non-negotiable.*
- **Required flavour/variant:** `flavours/variants ⊇ required modifiers` (confidence-gated → name fallback).
- **Dietary / allergen-free:** `is_vegan`, `is_gluten_free`, `NOT allergens ∩ allergen_free`.
- **Avoid:** `is_palm_oil_free`, `NOT has_added_sugar`, ingredient/INS scan, claims cross-check.
- **Nutrition absolute:** `sugar_g ≤ X`, `protein_g ≥ Y`, `price ≤ Z`.
- **Missing data:** if a hard facet is unknown for a product → **keep, flag `unverified:<facet>`, down-rank**
  (never silently drop = looks empty; never silently include = false trust).

This stage is what guarantees "only relevant things." Membership ≠ ranking.

### 6b. RANK — order within the relevant set (hybrid + business)
For `kind=product`, the relevant set is already small/clean → rank by deterministic keys:
1. modifier completeness (all required > partial)  2. constraint tier (all met > met-but-unverified > partial)
3. `sort_intent`/`relative` (tier sort)  4. `scout_score`  5. `data_completeness`.

For broad/`goal`/vague queries, fuse signals with **Reciprocal Rank Fusion**:
`RRF(lexical_rank, vector_rank)` → then blend health/sort. Vector recall handles "office snack that isn't
junk" where keywords fail; **vector only orders/expands, never overrides a §6a filter.**

DeepSeek reranking is invoked **only** for `kind=product` with ≥2 simultaneous constraints (genuinely hard) —
as an enhancement on top of the keys, never the sole arbiter.

### 6c. VERIFY — final precision check (Groq, batched, non-blocking)
Top ~20 in one batched Groq call: "is this a {type} that is {modifiers}? judge from text only, not numbers."
Returns `{id, is_type, modifiers_present, partial, reason}`. Wrong type / wrong flavour → removed; `partial`
(mixed-berry for strawberry) → kept below, labeled; `reason` → match chip. Because §6a/§2 already did most of
the work, verify is a cheap safety net, not the engine. Groq down ⇒ skip, deterministic stands. ~1 call/search
⇒ within 30 RPM free.

### 6d. RELAX — sparse results (explicit contract, always announced)
If survivors < 3: loosen in order — preferred modifiers → must_have → numeric one tier (or absolute→"lowest
in set") → unverifiable avoids. **Never relax `primary_type` or required flavour.** Banner states what changed
("No strawberry smoothie under 10g sugar — showing the 2 lowest, 12g & 14g").

---

## 7. Every query type → exact handling

| Query type | Example | Mechanism |
|---|---|---|
| Brand | `amul` | brand route, health rank |
| Type | `namkeen` | type filter, health rank |
| Type + flavour | `strawberry smoothie` | type filter + `flavours⊇[strawberry]` + verify |
| Type + abs nutrition | `biscuits under 5g sugar` | type filter + `sugar_g≤5` |
| Type + rel nutrition | `high protein milk` | type filter + `protein_tier='high'` sort |
| Type + negation | `peanut butter no palm oil` | type filter + `is_palm_oil_free` + ingredient scan |
| Type + dietary | `vegan protein bar` | type filter + `is_vegan` |
| Type + allergen-free | `nut free chocolate` | type filter + `NOT allergens∩[nuts]` |
| Type + health ctx | `biscuits for diabetics` | type filter + low-sugar/health rank |
| Pure goal | `something healthy for weight loss` | goal route, vector + health filter |
| Use-case | `pre workout snack` | `use_cases⊇[pre-workout]` + vector |
| Superlative/sort | `healthiest oats`, `cheapest milk` | type filter + sort_intent |
| Comparison | `healthier than maggi` | resolve ref → same type, higher scout_score |
| Multi-constraint | `strawberry smoothie low sugar no preservatives` | all filters ANDed + relax ladder |
| Misspelling | `smoothei`, `penut butter` | trigram fuzzy + vector robustness |
| Hindi/Hinglish | `bina cheeni doodh` | synonym map + multilingual embedding + negation |
| Vague NL | `tiffin stuff that isn't junk` | goal route, vector + nova/health filter |
| Ambiguous | `protein` | confidence split: if low, show type-results with a "did you mean a goal?" affordance |
| Word-order | `chocolate milk` vs `milk chocolate` | head-noun rule → opposite types |
| Empty/1-char | `` | no LLM; show landing/catalog |

---

## 8. Trust, degradation, performance

**Transparency:** per-result chips for *why matched* ("Strawberry ✓", "Sugar 4g — low") and *caveats*
("Sugar not on label"); set-level banner on relaxation. Never silent.

**Degradation ladder:** (1) full; (2) verify down → filter+hybrid+deterministic modifier match; (3) parse
down → heuristic parser; (4) all down → lexical over `search_doc`. Every tier keeps the §6a type filter, so
worst case is "precise keyword search," never random.

**Performance:** parse 1 Groq (cache≈free) · filter+rank over indexed columns ~100–150ms · verify 1 Groq
~500ms · DeepSeek only on hard ranking. Warm ~0.8s, cold ~2.5s. Groq 30 RPM ⇒ ~30 searches/min headroom.
DeepSeek spend ≈ 0 at query time.

---

## 9. Evaluation harness — how we *prove* best-in-class

`eval/search-cases.json` (~60 queries → `{must_include[], must_exclude[], expected_top1?}`) +
`scripts/eval-search.ts` running the live pipeline. Metrics: **forbidden-leak rate (must be 0)**,
precision@5 (≥0.8 gate), top-1 accuracy, mean latency, LLM calls/search. Seed from §7 table + real
`search_history`. **No search change ships unless leak-rate = 0.** This is what turns "foolproof" into a test.

---

## 10. Build order

1. **Index + enrichment** — `product_search_index` schema, enrichment script (DeepSeek, all fields),
   per-category tiers, embeddings (free multilingual model) + pgvector HNSW. *(biggest leverage; everything
   else reads from this)*
2. **Query understanding** — `lib/search/intent.ts`: QueryIntent, head-noun, atomic compounds, "with",
   synonyms, negation, fuzzy; Groq parse + heuristic floor.
3. **Filter→rank online** — type-gated filter over the index, deterministic keys + RRF hybrid for broad/goal.
   (fixes the wrong-product problem deterministically, no LLM needed)
4. **Groq verify** — batched precision net + chips, graceful fallback.
5. **Eval harness** — cases + runner; leak-rate=0 merge gate.
6. **Polish** — relaxation banners, ambiguity affordance, comparison/use-case routes, confidence chips,
   nightly re-enrichment of changed/new products.

---

## 11. Non-negotiables

- **Filters decide membership; scores decide order.** Embeddings/LLM never inject an off-type product.
- **Intelligence offline, serving online.** Normalize once per product, not once per search.
- **LLM judges language (type/flavour/nuance); deterministic judges numbers/ingredients.** Keep the split.
- **Never silently drop or include on missing data** — flag, down-rank, tell the user.
- **Never relax product type or required flavour.** Strawberry smoothie ≠ "some smoothies."
- **Verification is a net, not the engine, and is non-blocking.** Search never goes down with Groq.
- **Lexicons/synonyms are data; per-query rules are forbidden.** That's how we got here.

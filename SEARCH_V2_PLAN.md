# Search V2 — Best-in-Class Intent Search (Definitive Spec)

> Search is the make-or-break feature. This spec defines a precision-first pipeline that
> **never shows a product that contradicts the stated intent**, and within true matches ranks by health.
> Better to show 2 perfect strawberry smoothies than 8 with mango ones mixed in.

---

## 0. Ground truth from the live catalog (verified, not assumed)

These facts shaped every decision below. They invalidate the naive "gate on subcategory / read the Flavour attribute" approach.

| Finding | Evidence | Consequence |
|---|---|---|
| **Flavour is not a structured field** | 0 / 15 smoothies have any `Flavour` attribute | Modifier (flavour/variant) matching must read the **name**, not attributes |
| **Product type is not a subcategory** | 15 smoothies span 4 subcategories: *Frozen Veggies & Pulp, Yogurt & Shrikhand, Milk Drinks, Curd & Probiotic Drink* | Type detection is **name-driven**; subcategory is a weak secondary signal only |
| **Correct sets are tiny** | only **2** "strawberry smoothie" vs **15** "smoothie" | Precision-first; aggressive relaxation when a hard filter empties the set |
| **Useful structured signals exist** | attribute keys include `Marketing Claims`, `Label Free From`, `Label Chips`, `L3 Category` | Use these for claims ("No Added Sugar", "High Protein") and as a cleaner category signal |
| **Coverage is uneven** | smoothies have 100% nutrition+ingredients, but most catalog items do not | Missing data → **down-rank + label "unverified"**, never silently include or exclude |

---

## 1. Why the current search fails (root causes, confirmed in code)

1. **OR pool.** `getCatalogPoolForParsed` unions per-term SQL (`q:"strawberry"` ∪ `q:"smoothie"`) → mango smoothie + strawberry cookie both enter the pool.
2. **OR scoring.** `retrievalScore` adds points for *any* keyword hit, so off-type products survive into the top 100.
3. **Flat parse.** "strawberry smoothies" → `["strawberry","smoothies"]`, two co-equal keywords. No notion of head-noun vs modifier.
4. **No verification.** Nothing categorically asks "is this actually a strawberry smoothie?" before display — ranking is probabilistic, not a gate.
5. **No relaxation contract.** When a hard filter empties the set, behavior is undefined → random fallback.

---

## 2. Architecture: RECALL → PRECISION → RANK, with explicit roles

The cardinal rule that makes the data work:

> **The LLM judges TYPE and FLAVOUR (from text). Deterministic code judges NUMBERS (from nutrition) and INGREDIENTS (from the label).**
> Flavour isn't in structured data; numbers aren't reliable in text. Each judge does only what it's good at.

```
 user query
     │
 ┌───▼───────────────┐   1 call (Groq, cached 24h) · heuristic fallback
 │ QUERY UNDERSTAND  │   → QueryIntent { primary_type, modifiers, nutrition, avoid, sort, ... }
 └───┬───────────────┘
     │
 ┌───▼───────────────┐   SQL + in-memory · NO LLM
 │ RECALL (retrieve) │   type-gated pool (60–150). Modifiers NOT gated yet (kept for ranking/relax)
 └───┬───────────────┘
     │
 ┌───▼───────────────┐   deterministic — exact
 │ NUMERIC FILTER    │   sugar≤X, protein≥Y, price≤Z, dietary, avoid-ingredient scan
 │  + AVOID scan     │   missing data → keep + flag "unverified", down-rank (don't exclude)
 └───┬───────────────┘
     │
 ┌───▼───────────────┐   1 Groq call, batched ~20 products · non-blocking
 │ LLM VERIFY        │   "is this a {type} that is {modifiers}?" → {is_type, modifiers[], reason}
 │ (type + flavour)  │   false → removed. reasons become display chips
 └───┬───────────────┘
     │
 ┌───▼───────────────┐   deterministic sort keys
 │ RANK              │   modifier-completeness → constraint tier → sort_intent → health → data-completeness
 └───┬───────────────┘
     │
 ┌───▼───────────────┐
 │ RELAX (if <3)     │   loosen soft → numeric → unverifiable-avoid. NEVER drop type/required flavour. Banner.
 └───┬───────────────┘
     ▼  results + per-result chips + relaxation banner
```

**LLM budget: 1–2 calls/search.** Parse (cached, usually free) + one batched verify. DeepSeek reserved only for nuanced *ranking* of genuinely complex multi-constraint queries. Everything else is Groq (free) or deterministic.

---

## 3. Query understanding — the `QueryIntent` object

```typescript
type Modifier = {
  term: string;                       // "strawberry", "dark", "crunchy"
  kind: "flavour" | "variant" | "form";
  strength: "required" | "preferred"; // "strawberry smoothie" = required; "preferably vanilla" = preferred
};

type QueryIntent = {
  raw: string;
  primary_type: string | null;        // head noun. null for brand-only / pure-goal queries
  type_synonyms: string[];            // controlled expansion (see §4) — never free expansion
  modifiers: Modifier[];
  brand: string | null;
  nutrition: {                        // numeric, deterministic. null = unconstrained
    max_sugar_g?: number; min_protein_g?: number; max_fat_g?: number;
    max_sodium_mg?: number; max_calories?: number; max_price?: number;
    relative?: ("lowest_sugar" | "highest_protein" | "lowest_fat")[]; // "high protein milk" = relative
  };
  avoid: string[];                    // palm oil, maida, preservatives, INS-xxx, added sugar
  must_have: string[];                // positive ingredient asks: "with chia", "with almonds"
  dietary: ("veg" | "vegan" | "gluten_free" | "jain")[];
  health_context: string[];          // diabetic, kids, gym, pcos, fat_loss
  sort_intent: "relevance" | "cheapest" | "healthiest" | "highest_protein" | "lowest_sugar";
  kind: "product" | "brand" | "goal"; // routing (see §5)
  confidence: number;                 // 0–1; low → widen recall, lean on verification
};
```

### The head-noun rule (English compounds)

In "A B", **B is the head (the type), A is the modifier** — *unless* "A B" is a known atomic compound.

- `chocolate milk` → type=**milk**, modifier=chocolate *(it IS milk)*
- `milk chocolate` → type=**chocolate**, modifier=milk *(it IS chocolate)*
- `strawberry smoothie` → type=**smoothie**, modifier=strawberry
- Atomic compounds (a curated list — treated as one token, NOT split): `peanut butter, ice cream, soft drink, energy drink, green tea, protein bar, protein powder, dark chocolate, olive oil, dry fruits, corn flakes, baking soda, cottage cheese, chia seeds`.

### The "with" disambiguation

`with` is overloaded. Resolve by what follows:
- `with low sugar` / `with high protein` → **nutrition constraint** (adjective + nutrient)
- `with strawberry` / `with chocolate` → **flavour modifier**
- `with chia / almonds / oats` → **must_have ingredient**
- `without X` / `no X` / `bina X` / `X nahi` → **avoid** (existing negation engine, EN + HI)

### Relative vs absolute nutrition

"high protein **milk**" ≠ protein ≥ 12g (milk is ~3g). It means **highest protein within milk**. Rule: when a nutrition adjective is attached to a low-baseline type, emit `relative:["highest_protein"]` (rank-within-category) instead of an absolute threshold. Maintain a small baseline table for common types; default to absolute threshold when unknown.

### Parser stack (robust to LLM outage)

1. **Groq parse** (llama-3.1-8b-instant — fast/free) → `QueryIntent`. Cached 24h by `normalize(query)+prefsHash`.
2. **Heuristic parse** (deterministic floor; runs always, merged under LLM when present): type lexicon + atomic-compound list + modifier/flavour lexicon + constraint lexicon + synonym map + negation rules + fuzzy (trigram) match for misspellings (`smoothei→smoothie`). The heuristic must be good enough that LLM-down still yields correct compound handling.
3. Merge: trust LLM for `kind`/head-noun ambiguity; trust heuristic for numbers/negation it parsed with certainty. Never let one silently override a high-confidence signal from the other.

---

## 4. Controlled synonym vocabulary (curated — over-expansion is a bug)

Type synonyms expand recall **only** within a true equivalence class. Free expansion ("smoothie"→"juice") is how garbage gets in.

```
soft drink   → soda, cola, carbonated, fizzy, aerated
namkeen      → mixture, sev, bhujia, savoury snack
chips        → crisps, wafers
biscuit      → cookie, cracker          (cookie ⊂ biscuit; rank exact-token first)
curd         → dahi, yoghurt, yogurt    (yogurt borderline — rank dahi/curd first)
atta         → flour, wheat flour
milk         → doodh
paneer       → cottage cheese
ghee         → clarified butter
peanut butter→ pb
```
Hinglish/Hindi type words map into their English head (`doodh→milk, atta→flour, dahi→curd, chawal→rice`). **Smoothie has no synonym** — do not expand it to shake/juice; that was a source of mango-juice leakage.

---

## 5. Three query routes (don't force a product type)

| `kind` | Trigger | Path |
|---|---|---|
| **product** | head noun present ("strawberry smoothie", "low sugar biscuits") | full pipeline §2 |
| **brand** | query is/contains a known brand, no type ("amul", "epigamia") | retrieve brand's catalog → rank by health; skip type/flavour verify |
| **goal** | no product type, only intent ("something healthy for weight loss", "high protein snacks") | retrieve by health_context + nutrition across categories → verify relevance → rank by fit |

Brand + type ("amul paneer") = product route with `brand` as an extra hard filter. Brand + constraint ("amul low fat") = brand route + numeric filter.

---

## 6. Recall (retrieval) — type-gated, modifier-graded

- **Gate (hard):** product survives recall iff `primary_type` (or a synonym) matches **name OR L3 Category OR subcategory OR category**. This is the one categorical gate at recall. Fixes RC1/RC2.
- **Modifiers NOT gated here** — tracked as a score and a flag, so ranking and relaxation can use them. (Gating modifiers at SQL time would make relaxation impossible when the set is tiny — recall the 2-strawberry-smoothie reality.)
- **Pool target 60–150.** Pull via one SQL pass on `primary_type ∪ synonyms` (type only — never union in the modifier term). If pool < 20, widen synonyms / fuzzy; if still tiny, that's the real answer set — proceed.
- **Composite haystack with field weights** for downstream matching: `name`(3) · `brand`(2) · `L3 Category / subcategory`(2) · `Marketing Claims / Label Chips / Label Free From`(2) · `ingredients_raw`(1).

---

## 7. Numeric + avoid filter (deterministic, exact)

- **Numeric:** apply `max_sugar_g / min_protein_g / max_fat_g / max_sodium_mg / max_calories / max_price` against `nutrition`. `relative` constraints are not filters — they become sort keys (§9).
- **Avoid scan:** existing `ingredientPresent` (palm-oil family, maida, MSG, INS additives, sweeteners) + **claims cross-check** (`Label Free From: Preservatives` is positive evidence of absence). Negation engine (EN + HI) already feeds `avoid`.
- **Missing-data policy (critical):** if a product lacks the data needed to *verify* a hard constraint (e.g. no nutrition for "low sugar", no ingredients for "no palm oil") → **keep it but flag `unverified:<constraint>` and down-rank**. Do **not** silently drop (looks like we have no matches) and do **not** silently include as if confirmed (false trust). The chip tells the user ("Sugar not on label").

---

## 8. LLM verification (Groq, batched, non-blocking) — the precision gate

Runs on the top ~30 after deterministic pre-rank (bounds cost). One batched call.

```
SYSTEM: You are a strict grocery search verifier. For each product decide if it matches the user's
intent. A match requires: (a) correct product TYPE, and (b) ALL required flavours/variants present.
Judge ONLY from the text given (name/brand/category/claims). Do NOT judge sugar grams, price, or
nutrition numbers — those are checked separately. Treat "mixed berry" as a PARTIAL match for
"strawberry" (modifiers_present:false, but note it). Return STRICT JSON.

USER:
intent: { type: "smoothie", required_modifiers: ["strawberry"] }
products:
 [ {id, name, brand, category, claims}, ... up to 20 ]

→ [ { id, is_type: bool, modifiers_present: bool, partial: bool, reason: "≤10 words" }, ... ]
```

- `is_type=false` (mango smoothie is a smoothie but… actually it IS type=true; flavour=false) → kept only if no required modifier. **Wrong type** (strawberry *cookie* for "smoothie") → removed.
- `modifiers_present=false & partial=false` → removed (mango smoothie for "strawberry smoothie").
- `partial=true` (mixed-berry) → kept, ranked below full matches, chip "contains strawberry".
- `reason` becomes the match chip ("Strawberry confirmed") / reject is logged for the eval harness.
- **Single-call mode (default):** verify top 20 in one call → ~1 Groq call/search → ~30 searches/min under the 30 RPM free ceiling. Spillover (21–30) keep with deterministic verdict.
- **Graceful fallback:** Groq down/throttled → skip verification; deterministic name-word modifier match stands in. Never blocks, never crashes.

---

## 9. Ranking (deterministic sort keys, in order)

1. **Modifier completeness** — all required present > partial > (none, only if relaxed)
2. **Constraint tier** — meets all hard numeric/avoid > meets all but unverified > meets some
3. **`sort_intent` / `relative`** — lowest_sugar ↑, highest_protein ↑, cheapest ↑, healthiest = Scout score ↑
4. **Scout health score**
5. **Data completeness** — fully labeled > partially > unknown (so confident matches lead)

DeepSeek ranking is invoked **only** for `kind=product` with ≥2 simultaneous constraints (the genuinely hard cases) as an enhancement on top of these keys — never as the sole arbiter.

---

## 10. Relaxation ladder (sparse/empty results) — explicit contract

If survivors < `MIN_RESULTS` (3), relax in this order and **announce each relaxation**:

1. Drop `preferred` modifiers.
2. Drop `must_have` ingredient asks.
3. Loosen numeric thresholds one tier (low sugar 10→15g; or switch absolute→"lowest available in matches").
4. Drop avoid-constraints that are **unverifiable** for the remaining set (no label data anyway).
5. Last resort: show closest type matches with a clear banner.

**Never relaxed:** `primary_type` and `required` flavour modifiers — that's the user's core ask. Strawberry smoothie never degrades into "here are some smoothies."

Banner examples:
- "No strawberry smoothie under 10g sugar — showing the 2 lowest-sugar strawberry smoothies (12g, 14g)."
- "Couldn't verify preservatives for 3 of these — labels not scanned."

---

## 11. Edge-case catalogue (how each is handled)

| # | Query / situation | Handling |
|---|---|---|
| 1 | `chocolate milk` vs `milk chocolate` | head-noun rule: type=milk vs type=chocolate |
| 2 | `strawberry cookie` in a "smoothie" search | recall type-gate excludes (cookie ≠ smoothie) |
| 3 | `mango smoothie` in a "strawberry smoothie" search | verify: type ✓, modifier ✗ → removed |
| 4 | `mixed berry smoothie` for "strawberry" | verify partial=true → kept below full matches, labeled |
| 5 | only 2 true matches exist | precision-first; show 2, no padding with wrong items |
| 6 | all matches exceed sugar limit | relax §10 step 3, banner with actual values |
| 7 | `high protein milk` (low baseline) | `relative:[highest_protein]` → rank within milk, not absolute ≥12g |
| 8 | `no palm oil peanut butter`, no label data | keep + "ingredients not scanned" chip; down-rank vs confirmed-clean |
| 9 | `bina cheeni` / `cheeni nahi` (Hindi) | negation engine → avoid:[sugar] |
| 10 | misspelling `smoothei`, `penut butter` | trigram fuzzy match in heuristic parser |
| 11 | `peanut butter` split into peanut+butter | atomic-compound list keeps it one token |
| 12 | `amul` (brand only) | brand route — that brand's catalog, ranked by health |
| 13 | `something healthy for my kid` | goal route — health_context=kids, cross-category |
| 14 | `with chia` vs `with low sugar` vs `with strawberry` | "with" disambiguation (ingredient / constraint / flavour) |
| 15 | `cheapest oats`, some prices missing | sort cheapest; unknown-price items last (not first) |
| 16 | `vanilla protein shake` — "shake" not a subcategory | name-driven type match (same as smoothie) |
| 17 | Groq rate-limited mid-traffic | skip verify; deterministic modifier match; no crash |
| 18 | parse LLM down | heuristic parser handles compound + negation |
| 19 | smoothie filed under "Milk Drinks" subcategory | type-gate matches on NAME, not subcategory |
| 20 | `sugar free` vs `no added sugar` | distinct avoid tokens; claims `Label Free From` cross-checks |
| 21 | empty query / 1 char | no LLM; show landing/catalog, not a search |
| 22 | `gluten free bread` | dietary flag + avoid wheat/maida; ingredient + claims check |

---

## 12. Degradation ladder

1. **Full:** Groq parse (cached) → recall → numeric/avoid → Groq verify → rank (+DeepSeek on hard ones).
2. **Verify down:** recall (type-gated) → numeric/avoid → deterministic name-word modifier match → rank.
3. **Parse down:** heuristic parser (type+modifier+constraint+negation+fuzzy) → rest as above.
4. **All down:** lexical search on raw query.

Each tier still respects the type-gate, so the worst case is "decent keyword search," never "random products."

---

## 13. Cost & latency

| Step | Calls | Latency |
|---|---|---|
| Parse | 1 Groq (cache hit ≈ free) | ~300ms cold / 0 warm |
| Recall + numeric | 0 | ~150ms |
| Verify | 1 Groq batched | ~500ms |
| Rank | 0 (DeepSeek only on hard) | ~50ms |
| **Total** | **1–2 LLM** | **~0.8s warm · ~2.5s cold** |

Groq free: 30 RPM / 14.4k RPD. Single-call verify ⇒ ~30 searches/min headroom. DeepSeek spend stays near-zero (reserved for hard ranking only).

---

## 14. Evaluation harness (how we *prove* it, and prevent regressions)

The thing that makes this "best in class" and "foolproof": a labeled set run on every change.

- `eval/search-cases.json`: ~50 queries → `{ must_include: id[], must_exclude: id[], expected_top1?: id }`.
- `scripts/eval-search.ts`: runs each through the live pipeline, computes **precision@5**, **forbidden-leak rate** (any `must_exclude` shown = hard fail), **top-1 accuracy**, mean latency, LLM call count.
- Gate: **forbidden-leak rate must be 0**; precision@5 ≥ 0.8. CI-style local run before any search change ships.
- Seed cases directly from the regression table in §15 plus real queries from `search_history`.

---

## 15. Regression cases (must pass; leak = hard fail)

| Query | Expected top | Must NOT appear |
|---|---|---|
| strawberry smoothie with low sugar | strawberry smoothies (lowest sugar first) | mango smoothie, strawberry cookie, strawberry lassi |
| mango juice no preservatives | mango juice (confirmed clean) | mixed-fruit juice, mango biscuit |
| dark chocolate peanut butter | dark-choc PB | plain PB, milk-choc PB, choc biscuit |
| high protein milk | highest-protein milks | flavoured milk drinks, milkshakes, lassi |
| chocolate milk | chocolate-flavoured milk | milk chocolate bars |
| milk chocolate | milk chocolate bars | chocolate milk drinks |
| vanilla protein shake | vanilla shakes | chocolate shake, plain protein powder |
| oats with no added sugar | plain/natural oats | sugar-flavoured oats, oat cookies |
| ghee from grass fed cows | bilona/A2/grass-fed ghee | laddu, soan papdi |
| bina cheeni wala juice | no-added-sugar juices | sweetened juices |
| amul | Amul products by health | other brands |
| cheapest oats | lowest-price oats | unknown-price items ranked first |

---

## 16. Build order

**Phase 1 — deterministic core (fixes ~70%, no external deps)**
`lib/search/intent.ts` (QueryIntent + head-noun + atomic compounds + "with" + synonyms + fuzzy heuristic). Rewrite `getCatalogPoolForParsed` → type-gated recall (no modifier union). Rewrite `retrievalScore` → type-gate hard + modifier-graded. Wire numeric/avoid filter with missing-data flagging. Relaxation ladder + banner. Ship behind nothing — it's strictly better.

**Phase 2 — Groq verification**
`lib/search/groq-verify.ts` (batched, single-call, JSON-strict, graceful fallback). Insert as precision gate after pre-rank. Chips from `reason`.

**Phase 3 — eval harness**
`eval/search-cases.json` + `scripts/eval-search.ts`. Wire §15 cases. Make leak-rate=0 the merge gate.

**Phase 4 — polish**
Move parse to Groq (drop DeepSeek cost for parse). DeepSeek only on ≥2-constraint ranking. Relative-nutrition baseline table. Goal/brand routes hardened. Ingredient-confidence chips everywhere.

---

## 17. What NOT to do

- No new hardcoded per-query rules — that's how we got here. Lexicons/synonyms are data, rules are not.
- Never gate modifiers at SQL recall — kills relaxation when the true set is tiny (2 strawberry smoothies).
- Never let the LLM judge numbers, or deterministic code judge flavour. Keep the split.
- Verification stays non-blocking. Groq down ≠ search down.
- Never silently drop or silently include on missing data — flag and rank, always.
- Never relax `primary_type` or required flavour. Strawberry smoothie ≠ "some smoothies."

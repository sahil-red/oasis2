# Search Overhaul — Fix Plan

**Status:** Ready to execute
**Goal:** Make search trustworthy for every query class, stop calling the LLM when it isn't needed, and keep one search box.

---

## 0. Diagnosis (what's actually broken)

### Bug A — `sort_intent` and constraints are never applied deterministically
The parser correctly produces `sort_intent: "highest_protein"`, `hard_constraints`, `search_keywords`, `exclude_keywords`. But **nothing in the scoring layer uses `sort_intent`**:
- `retrievalScore` (`lib/search/ai-retrieval.ts:60`) ranks by keyword hits + `core_scores.score * 0.08`.
- `fallbackRank` (`lib/search/ai-rank.ts:166`) ranks by `core_scores.score * 0.5` + keyword hits.

Neither sorts by protein, sugar, or price. So "high protein milk" is **only** correct if the LLM ranker succeeds *and* chooses to sort by protein. Protein is sent to the LLM (`compactCandidate`) but used nowhere locally.

### Bug B — Scout score dominates, so commodity items win
Plain toned milk has a high Scout score (it's a clean whole food), so `core_score` weighting floats it to the top in both retrieval and fallback. Actual high-protein products (Epigamia 25g, Phab, Frubon HiLo, Horlicks Protein) have lower Scout scores (added ingredients) → pushed down. This is the exact inversion seen in the screenshot.

### Bug C — LLM is a single point of failure with silent, wrong degradation
When `rankCandidatesWithDeepseek` throws (timeout @28s, rate limit, bad JSON, missing key), it falls to `fallbackRank`, which produces the wrong order and stamps every card **"Catalog keyword match"** (`ai-rank.ts:185`). That string on every result = the fallback path is live. The batch DeepSeek jobs share the same API key and can starve live search.

### Bug D — Every query hits the LLM
Typing a brand ("amul") or a plain product ("namkeen") triggers a full parse + rank round-trip. Slow, costly, and unnecessary. The user wants the old instant local search back for these — **without** a second search box.

### Non-bug (context)
The "9,673 scored · 9,917 with labels" footer is global catalog stats (`catalog-view.tsx`), unrelated to search.

---

## 1. Target architecture: one box, three tiers

A single input. On submit, classify locally (zero network) and route:

```
query → normalize → classifyIntent()
  ├─ LEXICAL    → instant local catalog search (no LLM)            [tier 1]
  ├─ STRUCTURED → local deterministic semantic search (no LLM)     [tier 2]
  └─ COMPLEX    → deterministic search + LLM re-rank/explain        [tier 3]
```

Key principle: **tiers 2 and 3 share the same deterministic engine.** The LLM is only an *enhancement layer* on tier 3 (better phrasing of reasons, disambiguating fuzzy intent). If the LLM is unavailable, tier 3 degrades to tier 2 output — which is already correct — never to keyword-by-Scout-score garbage.

### 1.1 `classifyIntent(raw): "lexical" | "structured" | "complex"` (new, pure, no network)
Signals (all local):
- **CONSTRAINT_LEXICON** present → not lexical. Words/patterns: `high|low|no|without|zero|under|below|over|max|min`, `sugar|protein|fat|sodium|salt|fibre|fiber|calorie|carb`, `preservative|additive|palm oil|maida|gluten|vegan|veg|jaggery`, `diabetic|pcos|keto|gym|kids|weight loss|bulk`, `healthiest|cleanest|best|cheapest`, numeric+unit (`150`, `10g`, `₹`).
- **Multi-attribute / long** (≥ 5 tokens, or contains "and"/"with"/"for") → lean complex.
- **Pure noun(s)** — 1–3 tokens, no constraint lexicon, matches a brand or a known product-type/subcategory token → **lexical**.
- Default for "product term + one constraint" (e.g. "oats no added sugar") → **structured** (deterministic handles it fully).
- Reserve **complex** for: vague/health-goal intent ("something healthy for my kid's tiffin"), comparative/ambiguous phrasing, or when structured returns too few results and an LLM pass might rescue it.

Build a small static set for detection:
- `BRANDS` — derive once from the catalog (distinct `brand`), cached.
- `PRODUCT_TYPES` — distinct `subcategory` + a curated noun list (namkeen, biscuits, oats, milk, paneer, chips…).

### 1.2 Tier 1 — lexical (the "old free search")
Reuse the existing instant catalog endpoint (`/api/catalog/search?q=`). No parse, no rank, no LLM. Fuzzy/substring on name+brand+subcategory, sorted by Scout score (existing behavior). This is what the user misses — wire the single box to call it directly when `classifyIntent === "lexical"`.

### 1.3 Tier 2/3 — deterministic semantic engine (new `lib/search/semantic-rank.ts`)
This replaces reliance on the LLM for correctness. Pipeline:

1. **Retrieve by product-type relevance** (rewrite `retrievalScore`):
   - Hard gate on `exclude_keywords` (already there).
   - Product-type match tiers: subcategory exact (+60) > name/brand word-boundary (+42) > ingredient-mention-only ("X" appears after "with/in/contains") (+8, demoted) > category/aisle (+10).
   - **Drop or heavily downweight the `core_score * 0.08` term** so commodity Scout score stops dominating retrieval.
2. **Apply hard constraints as filters** (keep `passesHardConstraints`, extend — see §2).
3. **Deterministic ordering by `sort_intent`** (the missing piece):
   - `highest_protein` → `protein_g_100g` desc (nulls last), tie-break Scout score.
   - `cheapest` → price asc.
   - `healthiest` → Scout score desc.
   - `best_match` → relevance score desc, then Scout score.
   - Always keep the product-type gate as the primary partition: a real milk with 8g protein must rank above a non-milk with 30g when the user asked for "milk".
4. **Deterministic reasons** (so cards explain themselves with zero LLM):
   - protein intent → `"22g protein per 100g"`; sugar limit → `"Only 2g sugar"`; price → `"₹45 — under your ₹150"`; no-preservative → `"No preservatives on label"`; type → `"Toned milk"`.
5. **Optional LLM re-rank (tier 3 only):** pass the *already-correctly-ordered* top N to the LLM to (a) refine ordering on genuinely ambiguous intent and (b) rewrite reasons in nicer prose. On any failure, keep step 3/4 output. Never emit "Catalog keyword match".

---

## 2. Constraint coverage (the "low sugar / no preservatives" failures)

Make each constraint a deterministic, testable rule. Extend the parser lexicon AND `passesHardConstraints` / reason generation:

| User phrase | Parsed | Deterministic rule |
|---|---|---|
| "low sugar" | `max_sugar_g_100g: 10` | filter sugar ≤ 10; sort sugar asc within type |
| "no/zero sugar", "sugar free" | `max_sugar_g_100g: 1` | filter; reason "No/!1g sugar" |
| "no added sugar" | flag | `added_sugar_g_100g == 0` OR ingredient scan has no sugar/syrup/jaggery as added; sublabel `no_added_sugar` |
| "no preservatives" | flag | ingredient scan: no INS 200–299 and no word "preservative"; sublabel `contains_preservatives` absent |
| "no palm oil" | `avoid_ingredients:["palm oil","palmolein"]` | ingredient substring filter |
| "no maida" | `avoid_ingredients:["maida","refined wheat flour"]` | ingredient substring filter |
| "high protein" (+type) | `sort_intent: highest_protein` | sort protein desc within type (NO hard min) |
| "high protein" (no type) | `min_protein_g_100g: 12` | filter protein ≥ 12 (supplements/bars) |
| "low fat" | `max_fat_g_100g: 12` | filter + sort |
| "under ₹150" | `max_price: 150` | filter price ≤ 150 |
| "for diabetics / pcos" | health_context + `max_sugar 10` | filter + prefer low-GI, no hidden sweetener |
| "healthiest / cleanest / best X" | `sort_intent: healthiest` | sort Scout score desc within type |
| "vegan" / "veg" | `vegetarian:true` / vegan check | diet filter |

Rules engine notes:
- Preservative/additive detection should reuse the existing ingredient-intelligence / INS classification already used on the PDP (don't reinvent — there's an INS/E-number parser in `lib/ingredients` and `lib/scoring`). A product with unknown ingredients should **not** be silently dropped on a "no preservatives" query — mark it "label not confirmed" rather than excluding, OR rank it below confirmed-clean ones (decide: prefer *showing confirmed-clean first, unknowns after, known-bad excluded*).
- **Graceful relaxation:** if hard filters leave < N results, relax the softest constraint first, sort the relaxed ones below the strict ones, and set a `relaxed` flag with a clear note ("Few exact matches — showing close options"). Never return an empty/garbage page silently.

---

## 3. No-call-each-time (caching & routing)

1. **Lexical tier = zero LLM by construction** (biggest win; covers brand/product browsing).
2. **Structured tier = zero LLM** (deterministic engine handles it).
3. **Complex tier LLM caching:**
   - Cache parsed query keyed by `normalize(prompt)` (lowercase, trim, collapse spaces) — TTL 24h.
   - Cache full results keyed by `normalize(prompt)` — TTL ~1h (catalog changes rarely).
   - In-memory LRU on the server + `Cache-Control: s-maxage` on the response.
4. **Debounce** the box (250ms) and **don't re-call** on pagination — page locally through the already-returned ranked set, or fetch next page deterministically without re-parsing.
5. **Separate batch from live:** never let the DeepSeek label-extraction batch share the live-search rate budget — use a separate key or run batches at low concurrency / off-peak. (Live correctness no longer *depends* on the LLM after §1, but latency still matters.)

---

## 4. UX — still one box

- Single input. Submit → route silently.
- Subtle, honest status line (not two boxes):
  - lexical → no label (instant).
  - structured/complex → small "Scout is matching on nutrition…" only while loading; then the summary line.
- Result cards: deterministic reason chips always present ("22g protein", "No added sugar"), so results are self-explanatory regardless of tier.
- Kill the user-facing "Catalog keyword match" string entirely. If we ever can't rank semantically, show deterministic reasons, never that phrase.
- Keep the existing refinement chips for complex queries.

---

## 5. Execution phases

- **Phase 1 — Deterministic core (fixes the visible bug):**
  1. New `lib/search/semantic-rank.ts`: relevance gate + constraint filters + `sort_intent` ordering + deterministic reasons.
  2. Rewrite `retrieveCandidates` to gate on product-type, drop `core_score` dominance.
  3. Rewire `runAiProductSearch` to: retrieve → deterministic rank → (optional) LLM re-rank/explain → return. LLM failure = keep deterministic output.
  4. Delete `fallbackRank`'s "Catalog keyword match" reasons; deterministic reasons replace them.
  5. Verify "high protein milk", "low sugar biscuits", "no preservatives juice", "paneer under ₹150", "cheapest oats", "healthiest namkeen" by hand.
- **Phase 2 — Intent routing + lexical tier:**
  1. `classifyIntent()` + brand/product-type sets from catalog.
  2. Wire the single box: lexical → `/api/catalog/search?q=`; else → semantic endpoint.
  3. Verify "namkeen", "amul", "lays", "epigamia" make **zero** LLM calls (log/inspect network).
- **Phase 3 — Constraint completeness:** extend parser lexicon + heuristic parser fallback so even without the LLM the parse is right for the common constraint phrases in §2. Reuse ingredient-intelligence for preservative/additive detection. Implement graceful relaxation.
- **Phase 4 — Caching & polish:** parsed+result caches, debounce, no-recall pagination, batch/live key separation, status-line UX, remove "Catalog keyword match".
- **Phase 5 — Regression set:** lock the §6 cases as a checklist; run after any future change.

Typecheck clean + commit at each phase.

---

## 6. Acceptance / regression cases (must all pass)

Relevance:
- `high protein milk` → protein milkshakes / high-protein milks (Epigamia, Frubon HiLo, Phab, Horlicks Protein) on top; plain 3g toned milk **not** in the first row.
- `low sugar biscuits` → biscuits with sugar ≤ 10g, sorted ascending; no high-sugar cookies up top.
- `no preservatives juice` → juices with no INS 200–299 / "preservative"; preserved ones excluded; unknown-label ones ranked below.
- `paneer under ₹150` → only paneer ≤ ₹150; no paneer-flavored other things.
- `ghee` → jars/tins of ghee, **not** "ghee laddu" / "soan papdi" (product-type gate).
- `cheapest oats` → oats sorted by price asc.
- `healthiest namkeen` → namkeen sorted by Scout score desc.

Routing / cost:
- `namkeen`, `amul`, `lays`, `oats`, `epigamia` → **lexical, zero LLM calls**, instant.
- `oats no added sugar`, `high protein curd` → semantic, deterministic order correct even with the LLM key removed.
- Repeat of the same complex query within TTL → **no new LLM call** (served from cache).

Robustness:
- With `DEEPSEEK_API_KEY` unset, every semantic query still returns correctly-ordered results with sensible reason chips and **never** the words "Catalog keyword match".
- Hard filter with no matches → relaxed results + clear note, never empty-silent.

One box:
- All of the above through a single input; no second search field anywhere.

---

## 7. Guardrails

- Don't break `/api/catalog/search` (lexical tier depends on it) or the catalog grid.
- Keep the parser's output shape; only extend lexicon and the heuristic fallback.
- Don't reintroduce a modal search on mobile or a second box on web.
- Reuse existing ingredient/INS intelligence — do not fork a second additive parser.

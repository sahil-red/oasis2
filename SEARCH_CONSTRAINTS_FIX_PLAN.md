# Search Constraints Fix Plan — Ingredient Avoidance

**Status:** Ready to execute
**Trigger:** "peanut butter with no palm oil" ranks Pintola (contains "Hydrogenated Vegetable Oils (Rapeseed and Palm)") at #2. Aaha (genuinely palm-free) ranks near the bottom.

---

## Confirmed bugs (code-traced, reproduced in isolation)

### Bug 1 — Palm oil regex is too narrow (PRIMARY CAUSE)

**Location:** `lib/search/ai-retrieval.ts:37`, `lib/search/semantic-rank.ts:298`

Both files check:
```ts
if (a.includes("palm") && /palm oil|palmolein|palm fat/i.test(ingredients)) return false;
```

Pintola's `ingredients_raw` = `"Roasted Peanuts, Dark Chocolate Paste, Sugar, Hydrogenated Vegetable Oils (Rapeseed and Palm)"`.

Test: `/palm oil|palmolein|palm fat/i.test(...)` → **false**. The word "Palm" appears alone inside parentheses, not as "palm oil". The filter passes the product through, so it reaches the ranked results despite containing palm fat.

**Confirmed fix:** Replace the narrow regex with one that catches all forms palm appears in ingredient lists:
```ts
const PALM_DETECT_RE = /\bpalm\b(?:\s*(?:oil|kernel|stearin|fat|olein))?|\bpalmolein\b/i;
```
This correctly catches all of: `palm oil`, `palmolein`, `palm fat`, `palm kernel`, `palm stearin`, `Rapeseed and Palm`, `Vegetable Oil (Palm)`, `(Palm)`.

---

### Bug 2 — Heuristic parser creates duplicate `avoid_ingredients` entries

**Location:** `lib/search/query-parse.ts:236` and `lib/search/query-parse.ts:268`

For query "peanut butter with no palm oil":
1. Line 236: `/palm oil/.test(lower)` → true → sets `avoid_ingredients = ["palm oil"]`
2. Line 268: `/no palm oil|without palm oil/.test(lower)` → true → appends "palm oil" + "palmolein"

Result: `avoid_ingredients = ["palm oil", "palm oil", "palmolein"]` — "palm oil" duplicated. Minor (dedup at check time) but wasteful.

**Fix:** Delete line 236. It's a subset of line 268. The "no palm oil" handler at line 268 already fires for any query containing "palm oil" in a negative context, and line 236 fires spuriously even for queries like "ghee with palm oil flavor" where the user *wants* palm oil.

---

### Bug 3 — Parser doesn't emit the full palm oil synonym family

**Location:** `lib/search/query-parse.ts:268–272`

Currently emits: `["palm oil", "palmolein"]`

Missed forms that appear in Indian packaged food labels:
- "Hydrogenated Vegetable Oils (Palm)" — covered by Bug 1 fix
- "Palm stearin" — not covered
- "Palm kernel oil" — not covered
- "Refined Palm Oil" — covered once regex fixed

**Fix:** Emit the broader list:
```ts
avoid_ingredients: ["palm oil", "palmolein", "palm stearin", "palm kernel"]
```
Combined with the broader regex in Bug 1, this catches all real-world forms.

---

### Bug 4 — `passesSemanticConstraints` doesn't boost confirmed-clean products

**Location:** `lib/search/semantic-rank.ts`

The filter correctly excludes products with palm oil (once Bug 1 is fixed). But among the products that *pass* the filter, there's no positive signal for products that are **confirmed** palm-oil-free (e.g., those with the `no_added_sugar` / clean label deepseek chips, or whose full ingredient list was read and contains no palm).

Result: Aaha (genuinely palm-free with a clean label) gets the same score as a product whose ingredients simply weren't checked (because it scored higher on Scout score or keyword match).

**Fix:** Add a positive scoring term in `semanticScore()`:
- If `avoid_ingredients` includes "palm oil" terms AND the product has `ingredients_raw` with no palm variant AND `ingredients_raw` is non-null → add `+15` "confirmed palm-free" bonus.
- If `ingredients_raw` is null/empty AND `avoid_ingredients` is non-empty → apply a `-20` "unverified ingredients" penalty instead of silently passing (see also Bug 1 parent issue in SEARCH_FIX_PLAN.md).

---

## Execution

All four bugs are in three files. Changes are small and surgical.

### Phase 1 — Fix the regex (fixes Pintola ranking, 2 lines)

`lib/search/ai-retrieval.ts` line 37:
```ts
// BEFORE
if (a.includes("palm") && /palm oil|palmolein|palm fat/i.test(ingredients)) return false;

// AFTER
if (a.includes("palm") && /\bpalm\b(?:\s*(?:oil|kernel|stearin|fat|olein))?|\bpalmolein\b/i.test(ingredients)) return false;
```

`lib/search/semantic-rank.ts` line 298: same replacement.

### Phase 2 — Fix the parser (3 lines)

`lib/search/query-parse.ts`:
1. **Delete** line 236 (`if (/palm oil/.test(lower)) ...`).
2. **Expand** the avoid_ingredients list at line 268:
```ts
if (/no palm oil|without palm oil|palm.?oil.?free/.test(lower)) {
  parsed.hard_constraints.avoid_ingredients = [
    ...(parsed.hard_constraints.avoid_ingredients ?? []),
    "palm oil", "palmolein", "palm stearin", "palm kernel",
  ];
}
```

Also extend the LLM system prompt (same file) to specify: when user says "no palm oil", include full synonym list in `avoid_ingredients`.

### Phase 3 — Confirmed-clean bonus in semantic ranker (~10 lines)

`lib/search/semantic-rank.ts` inside `semanticScore()`:
```ts
// Positive: confirmed palm-free when user asked for no palm oil
const wantsPalmFree = (parsed.hard_constraints.avoid_ingredients ?? [])
  .some((a) => a.includes("palm"));
if (wantsPalmFree && p.ingredients_raw) {
  const ing = p.ingredients_raw.toLowerCase();
  if (!/\bpalm\b/i.test(ing)) score += 15; // confirmed clean
} else if (wantsPalmFree && !p.ingredients_raw) {
  score -= 20; // unverified — rank below confirmed clean
}
```

### Phase 4 — Regression check (verify, don't commit blind)

After the code changes, test these queries locally using the regression approach from SEARCH_FIX_PLAN.md §6:

| Query | Expected top result | Expected exclusion |
|---|---|---|
| `peanut butter with no palm oil` | Aaha / other palm-free peanut butters | Pintola Creamy (contains "Rapeseed and Palm") |
| `chips without palm oil` | Products confirmed palm-free | Any chips listing "palmolein" or "palm" in ingredients |
| `biscuits no palm oil` | Biscuits with no palm variants in label | Britannia/Parle with palmolein |
| `no maida biscuits` | Whole wheat / millet biscuits | Products with "maida" or "refined wheat flour" |
| `juice no preservatives` | Juices with no INS 200-299 | Juices with sodium benzoate / potassium sorbate |

### Phase 5 — Extend same fix to other ingredient avoidance patterns

The same regex-too-narrow problem likely affects:
- **Maida**: "refined wheat flour" might appear as "wheat flour (refined)" → check `\brefined\b.*\bwheat\b` too
- **Preservatives**: INS 211 can appear as "E211", "Sodium Benzoate", or "INS211" — extend `preservativeStatus()` if needed

These are lower priority; do in a follow-up if confirmed broken.

---

## What this does NOT fix

- If a product has `ingredients_raw = null` (2 of 228 peanut butter products), it still passes the filter. Phase 3 adds a penalty but doesn't exclude. Excluding null-ingredient products entirely would hurt recall too much (many legitimate products have missing data). The penalty approach is the right balance.
- Products where palm oil is declared via INS/E number only (e.g., E471 which *can* be palm-derived but isn't exclusively) — this is not fixable deterministically; needs ingredient intelligence. Out of scope.

---

## Files to touch

| File | Change | Scope |
|---|---|---|
| `lib/search/ai-retrieval.ts` | Widen palm regex | 1 line |
| `lib/search/semantic-rank.ts` | Widen palm regex + confirmed-clean bonus | ~12 lines |
| `lib/search/query-parse.ts` | Delete duplicate line, expand synonym list, update LLM prompt | ~8 lines |

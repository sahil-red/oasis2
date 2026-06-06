# Search V2 — Fix Plan

**Problem:** "strawberry smoothies with low sugar" returns mango smoothies, strawberry cookies, strawberry lassi — anything matching EITHER "strawberry" OR "smoothie", not the compound.

---

## Root causes (confirmed in code)

### RC1: Pool construction is OR, not AND

`getCatalogPoolForParsed` (ai-search.ts:51) runs separate SQL queries per term and unions results:
- `searchProducts({q: "strawberry"})` → 400 products (all strawberry-named items)  
- `searchProducts({q: "smoothies"})` → 400 products (all smoothies, mango/banana/mixed)
- Union → ~800 products: mango smoothie ✓ in, strawberry cookie ✓ in, both WRONG

**Fix:** Compound queries must use AND. "strawberry smoothies" → SQL: `name ilike %strawberry% AND (name ilike %smoothie% OR subcategory ilike %smoothie%)`.

### RC2: Retrieval scoring uses OR logic

`retrievalScore` (ai-retrieval.ts) gives positive score to any keyword match:
- "Mango Smoothie" matches "smoothies" (+30) → enters top 100 candidates
- "Strawberry Cookie" matches "strawberry" (+10) → enters top 100

LLM then gets 100 bad candidates and has to clean up a broken pre-filter.

**Fix:** For compound queries (multi-term product types), ALL terms must score positive for a product to pass retrieval. A product matching only "strawberry" but not "smoothie" should score 0.

### RC3: "strawberry smoothies" parsed as two independent terms

Current parser: `product_terms: ["strawberry", "smoothies"]` — treated as two equal keywords.

It should be: `primary_type: "smoothie"` (the product category) + `required_modifier: "strawberry"` (must be present — it's a flavour). These play different roles:
- primary_type: governs which category/subcategory the product lives in
- required_modifier: must appear in name, brand, ingredients, or attributes

### RC4: No verification step

No system currently double-checks "does this product actually match the query?" before showing it. We rely entirely on scoring, which is probabilistic not categorical.

---

## Fix plan (5 phases, ordered by impact)

---

### Phase 1 — Compound query detection + AND pool construction

**New module: `lib/search/compound-detect.ts`**

Detect when query has a `[modifier] + [product_type]` pattern:

```typescript
type CompoundQuery = {
  primary_type: string;          // "smoothie" — drives category gate
  required_modifiers: string[];  // ["strawberry"] — all must be present
  constraints: ParsedProductQuery["hard_constraints"];
}
```

**Known product type nouns** (curated set of ~60):
smoothie, juice, milk, curd, yogurt, lassi, buttermilk, paneer, ghee, butter,
bread, oats, biscuit, cookie, chips, chocolate, bar, protein bar, powder,
cereal, granola, muesli, rice, atta, dal, oil, pickle, sauce, jam, honey...

**Modifier detection:** If a product term is NOT in the primary_type set, it's a modifier.
- "strawberry smoothies" → primary="smoothie", modifiers=["strawberry"]
- "dark chocolate peanut butter" → primary="peanut butter", modifiers=["dark chocolate"]
- "vanilla protein shake" → primary="protein shake", modifiers=["vanilla"]
- "mango lassi no sugar" → primary="lassi", modifiers=["mango"], constraint=no_sugar

**Pool construction with AND:**
```typescript
// Step 1: get products matching the PRIMARY type (category gate)
const typePool = await searchProducts({ q: primaryType, limit: 500 });

// Step 2: filter to products ALSO matching ALL modifiers
const pool = typePool.filter(p => {
  const hay = [p.name, p.brand, p.ingredients_raw, p.attributes?.["Flavour"]].join(" ").toLowerCase();
  return modifiers.every(mod => wordMatch(hay, mod));
});

// Step 3: if pool is too small (<15), relax modifier to name-only match
// with a warning that we're showing close matches
```

This eliminates RC1 and RC2 together.

---

### Phase 2 — Retrieval scoring: require ALL product terms

**In `ai-retrieval.ts:retrievalScore`**, change from OR to AND for compound queries:

```typescript
// Current (OR — any keyword adds score)
for (const kw of keywords) {
  if (matches(hay, kw)) score += 10;
}

// New (AND — missing any primary type term = score 0)
const primaryTerms = parsed.product_terms; // from compound detection
const modifierTerms = parsed.required_modifiers ?? [];

// ALL primary terms must match
const allPrimaryMatch = primaryTerms.every(t => wordMatch(hay, t));
if (!allPrimaryMatch) return 0;  // hard gate

// Score by how many modifiers match  
const modifierScore = modifierTerms.filter(m => wordMatch(hay, m)).length * 15;
score += modifierScore;
```

This eliminates RC2.

---

### Phase 3 — Groq verification layer (free, fast)

After deterministic ranking returns top N, verify each product against the query using Groq's **Llama 3.3 70B** (30 RPM free tier). Each verification is ~60 tokens — can check 10-15 products per call.

**Why Groq and not DeepSeek for verification:**
- Groq is near-instant (<500ms even for 70B)
- Verification is simple binary: "does this match?" — fast model is fine
- Groq free: 30 RPM, 14,400 RPD — enough for verification of top results
- DeepSeek is already used for ranking; verification is a separate concern

**Verification call:**
```
System: You verify if a grocery product matches a user's search. 
        Return JSON: {"match": true/false, "reason": string (10 words max)}
        Be strict about product TYPE and required attributes.

User: Query: "strawberry smoothies with low sugar"
      Product: "Mango Smoothie by Raw Pressery"
      Subcategory: Juices
      → Does this match?

Expected: {"match": false, "reason": "No strawberry — mango flavour"}
```

**Implementation:**
- Fire verification calls in parallel for top 15 candidates
- Products with `match: false` are removed from results
- Remaining are sorted by deterministic score + original LLM rank
- Reasons from verification are used as display chips ("Strawberry confirmed", "Low sugar on label")
- If Groq is down/rate-limited → skip verification, show deterministic results (never crash)

**Groq model:** `llama-3.3-70b-versatile` or `mixtral-8x7b-32768` (even faster, fine for binary)

---

### Phase 4 — Enhanced LLM system prompt for compound queries

Update both **parser** (query-parse.ts) and **ranker** (ai-rank.ts) prompts:

**Parser additions:**
```
- Compound product queries: "strawberry smoothies" = product "smoothie" with required flavour "strawberry".
  product_terms: ["smoothie"], required_modifiers: ["strawberry"]
  Do NOT put the modifier in product_terms separately — it must appear in the product.
- "dark chocolate peanut butter" → product_terms:["peanut butter"], required_modifiers:["dark chocolate"]
- "mango juice" → product_terms:["juice"], required_modifiers:["mango"]
- "vanilla protein shake" → product_terms:["protein shake"], required_modifiers:["vanilla"]
```

**Ranker additions:**
```
- CRITICAL: required_modifiers are MANDATORY. Score = 0 for any product not containing ALL modifiers 
  in name, brand, or ingredients. "Mango Smoothie" scores 0 for query "strawberry smoothie".
- Flavour/ingredient modifiers must appear in the product — not just be in the same category.
```

Add `required_modifiers: string[]` to `ParsedProductQuery` type.

---

### Phase 5 — Ingredient-level verification for attribute queries

For queries like "no palm oil peanut butter" or "gluten free oats" — the existing ingredient check filters out confirmed-bad products, but products with missing ingredient data still slip through.

**Add ingredient confidence to result cards:**
- `ingredient_verified: true` — we have ingredient data and it's confirmed clean
- `ingredient_verified: false` — no label data, can't confirm
- `ingredient_has_violation: true` — filtered out entirely

Products with `ingredient_verified: false` show a "Unverified — check label" chip instead of "No palm oil confirmed."

**Use Groq to infer ingredient likelihood:**
For high-confidence commercial products with no OCR data, ask Groq:
"Does [product name, brand, category] typically contain palm oil?"
Use this as a soft signal (not a hard filter) to down-rank suspicious unknowns.

---

## Implementation order (3 days to ship)

**Day 1:** Phase 1 (compound detection + AND pool) + Phase 2 (retrieval AND logic)
- These two together fix ~70% of the wrong-product problem
- No external dependencies, purely deterministic
- Regression test: strawberry smoothies, mango juice, chocolate oats, vanilla protein shake

**Day 2:** Phase 3 (Groq verification)
- Add Groq API key to .env.local and Vercel
- Verification wrapper with graceful fallback
- Test at 30 RPM free tier ceiling

**Day 3:** Phase 4 (parser prompt) + Phase 5 (ingredient confidence chips)

---

## Regression test cases (must all pass after fixes)

| Query | Expected top 3 | Must NOT appear |
|---|---|---|
| strawberry smoothies with low sugar | strawberry smoothies, strawberry protein shakes | mango smoothie, strawberry cookie, strawberry lassi |
| mango juice no preservatives | mango juice (confirmed clean) | mixed fruit juice, mango biscuit |
| dark chocolate peanut butter | dark chocolate PB variants | plain PB, milk chocolate PB, chocolate biscuits |
| vanilla protein shake | vanilla protein shakes | chocolate shake, plain protein powder |
| oats with no added sugar | plain/natural oats | flavoured oats with sugar, oat cookies |
| ghee from grass fed cows | bilona/A2/grass-fed ghee | laddu, soan papdi |
| kids snacks no artificial colours | clean-label kids snacks | adult snacks, artificially coloured items |

---

## What NOT to do

- Don't add more hardcoded rules — that's how we got here
- Don't increase LLM call count beyond 2 per search (parse + rank) — latency matters
- Don't make Groq verification blocking — always keep it as a non-blocking enhancement
- Don't change the UI or result card format — purely a backend retrieval fix

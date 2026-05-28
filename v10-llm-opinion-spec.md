# v10: LLM-generated opinion layer

**Status**: spec · written 2026-05-28 · ready to ship after OCR+Groq finishes the current run

## Goal

Augment the deterministic V9 scoring with an LLM-generated **opinion** per product:

- A 1-sentence **headline** (the editorial verdict, in plain English)
- A 2-3 sentence **why** paragraph (replaces the rule-based bullet list on PDP)
- A short **caveat** line (optional — "Skip if you're tracking sodium" etc.)

V9 numbers stay deterministic and auditable. The LLM only writes prose, never numbers.

## Why this is safe (and the ingredient classification was not)

| | Ingredient v2 (the bad run) | Opinion v10 |
|---|---|---|
| Task | Classify "sucralose" → NOVA + concern_tier | Write 2 sentences about a fully-scored product |
| Failure mode | Wrong NOVA class → wrong score → wrong verdict | Awkward wording at worst |
| Ground truth | Hard (food science) | Soft (the V9 score is the source of truth) |
| Hallucination cost | Pollutes downstream scoring forever | Re-render to fix; V9 unaffected |

The LLM has nothing to make up — it's *summarizing*, not *judging*.

## Data sent to LLM (input shape)

For each product, build a structured payload:

```json
{
  "product": {
    "name": "Sunrise Pure Chana Masala",
    "brand": "Sunrise",
    "category": "Masala, Dry Fruits & More",
    "subcategory": "Powders & Pastes",
    "net_weight": "100 g",
    "price_inr": 65
  },
  "scoring": {
    "score": 64,
    "verdict": "good_choice",
    "role_cohort": "adjunct",
    "absolute_score": 60,
    "relative_score": 70,
    "cohort_size": 47,
    "rule_based_chips": ["clean_carbs", "high_in_protein"]
  },
  "nutrition_per_100g": {
    "energy_kcal": 320,
    "protein_g": 20,
    "carbs_g": 38,
    "fat_g": 8,
    "fiber_g": 12,
    "sugar_g": 4,
    "sodium_mg": 4500
  },
  "nutrition_per_serve": {
    "serving_g": 5,
    "energy_kcal": 16,
    "protein_g": 1,
    "sodium_mg": 225
  },
  "ingredients": [
    {
      "name": "coriander seeds",
      "nova_class": 1,
      "role": "base_food",
      "concern_tier": "innocuous",
      "intrinsic_quality": 85,
      "concern_reasons": []
    },
    {
      "name": "salt",
      "nova_class": 1,
      "role": "flavor",
      "concern_tier": "watchful",
      "intrinsic_quality": 60,
      "concern_reasons": ["High sodium; limit if hypertensive or sodium-sensitive"]
    },
    // ... up to ~15 ingredients (truncate if more, prefer the first ones — they have the highest position weight)
    {
      "_truncated": "12 more ingredients"
    }
  ],
  "flagged_additives": [
    // From matchAdditives() — only moderate or hazardous tier
    { "name": "INS 110 (Sunset Yellow)", "tier": "moderate" }
  ],
  "label_mismatch": false,
  "marketing_claims_on_pack": ["No added preservatives", "Natural"]
}
```

Why each field is included:
- **role_cohort**: adjunct vs treat changes everything (no "good protein density" on masala)
- **rule_based_chips**: LLM should *agree* with these, not contradict; or call out when one is misleading in context
- **per_serve nutrition**: lets LLM say "tiny amounts per dish" for adjuncts
- **ingredients with concern_tier**: LLM has the same knowledge we do, can cite specific items
- **flagged_additives**: hard signal — LLM must mention if any
- **label_mismatch**: lets LLM call out marketing-vs-reality

## Output shape (strict JSON)

```json
{
  "headline": "Decent masala, but it's mostly salt.",
  "why": "Coriander and cumin lead the list, which is what you want in a chana masala. But sodium is high — 225mg in a 5g serving — so go easy if you cook with it daily. No artificial colors or preservatives, which is rare in this category.",
  "caveat": "Skip if you're on a low-sodium diet.",
  "tone": "honest"
}
```

Constraints:
- `headline`: ≤ 80 chars, opinionated, no marketing fluff. No "amazing" / "delicious" / "premium".
- `why`: 2-3 sentences max. Cite specifics from the data (numbers, ingredients, percentages). No generic platitudes.
- `caveat`: optional, ≤ 60 chars. Only set if a specific user group should skip.
- `tone`: enum — `honest` (default), `enthusiastic` (for daily_staple), `skeptical` (for marketing-claim mismatches), `dismissive` (for skip-tier with hazardous).

## System prompt

```
You're a no-nonsense grocery editor. You write 2-3 sentence verdicts on Indian
packaged foods. Voice: direct, slightly dry, never preachy. Never use marketing
words ("amazing", "delicious", "premium"). Never say "this product" — just say
what it is.

Always cite specific evidence from the data:
- If sodium is high, give the mg
- If an ingredient is concerning, name it
- If marketing claims contradict the label, point it out

Adjust tone for role:
- Adjunct (masala/oil/ghee): judge by ingredient quality, not macros. Per-100g
  numbers don't matter — people eat tiny amounts. Lead with what's actually IN it.
- Treat (chocolate/cola): don't pretend it's healthy. Note if it's worse than
  category average. Brief, accepting.
- Staple/snack: lead with the macro story, then ingredient quality.

Output strict JSON matching the schema. No markdown, no preamble.
```

## Per-product caveats (LLM should know)

- If `role_cohort = adjunct`: do NOT use the phrase "good protein density" or
  similar — it's misleading on small servings.
- If `flagged_additives.length > 0`: must mention at least the worst one.
- If `label_mismatch = true`: the headline should reflect this ("Says 'natural'
  but contains acesulfame-K").
- If `verdict = skip` AND `relative_score >= 80`: nuanced — "Best of a bad
  category, but still mostly sugar."

## Provider plan

**Use Groq free tier** with the same multi-model trick as the OCR run:

- `llama-3.1-8b-instant` (fast, decent prose)
- `llama-3.3-70b-versatile` (higher quality for hero/PDP products)
- `meta-llama/llama-4-scout-17b-16e-instruct`
- `groq/compound-mini`
- `groq/compound`
- `allam-2-7b`

Each has a separate per-day RPD limit. Combined: ~6-8K calls/day on free tier.
For 17K products: 2-3 days on free tier, OR ~$1-2 paid (when paid signups reopen).

Output is small (~150 tokens), so **TPM is not a constraint** — RPD is.

Per-call latency on Groq: ~0.3-1.5s.

## Storage

Add a column to `core_scores`:

```sql
alter table core_scores
  add column if not exists opinion jsonb;

-- shape: { headline, why, caveat?, tone, model, generated_at }
```

Cached forever per `rule_version` — only re-generated when V9 rules change.

## Pipeline

```
scripts/generate-opinions.ts
  --batch-size=8         # 8 products per LM call (output array)
  --models=...           # comma-separated, round-robin like OCR pipeline
  --resume               # skip products that already have opinion at current rule_version
  --limit=N              # for testing
```

Reuses the existing `LM_STUDIO_API_KEY` + `LM_STUDIO_BASE_URL` env vars. Same
resilience as OCR pipeline (429 retries, JSONL checkpoint, parallel consumers).

## UI integration (after generation)

### PDP "Why" section
Replace the rule-based bullet list with the LLM `why` paragraph. Add the
`headline` as a strong subhead above. Keep the rule-based chips (those filter
the catalog).

```tsx
<section className="mt-6">
  <p className="text-[11px] uppercase tracking-[0.18em] text-fg-dim">
    Verdict
  </p>
  <h3 className="font-display mt-3 text-2xl">{opinion.headline}</h3>
  <p className="mt-3 text-[15px] leading-relaxed text-fg">{opinion.why}</p>
  {opinion.caveat && (
    <p className="mt-3 text-[12px] italic text-fg-muted">{opinion.caveat}</p>
  )}
</section>
```

### Homepage hero
Use the `headline` for editorial picks. The current `heroPitch()` heuristic
becomes a fallback for the seconds before the LLM-generated headline arrives.

### Catalog cards
Don't show the opinion on cards (would be too much text). The verdict chip
already does that job.

## Quality controls

Before shipping the run:

1. **Pilot 50 products** across all role_cohorts. Audit by hand.
2. Reject any opinion that:
   - Hallucinates a number not in the input
   - Uses marketing words ("delicious", "amazing")
   - Contradicts the V9 verdict
   - Is longer than 250 chars total

3. Refusal handling: if LLM returns invalid JSON twice, fall back to the
   existing rule-based bullets. **Never block a PDP.**

## Cost / time estimate

| Tier | 17K products | Time |
|---|---|---|
| Groq free, 6 models stacked | $0 | ~2-3 days |
| Groq paid (Llama 8B) | ~$1.30 | 30-60 min |
| Local Qwen 2.5 3B (current setup) | $0 | ~3 hours |

Recommend: **try Groq free first** (no rush — opinions are nice-to-have, not
blocking), fall back to paid only if needed.

## Risks (and mitigations)

| Risk | Mitigation |
|---|---|
| LLM contradicts V9 verdict | System prompt forbids it; output validator checks |
| LLM hallucinates ingredient names | Only mention ingredients from the input list |
| Bad opinions ship to prod | Audit 50 first; PDP gracefully falls back to rule-based bullets if `opinion` is null |
| Drift over time | Stored per rule_version; re-run on V9 changes |
| Rate limits | Same per-model multi-key strategy as OCR; resilient retry |

## Order of operations (post-OCR)

1. Wait for current OCR+Groq run to finish (~3h ETA from now)
2. Run rescore (V9 picks up new ingredient + nutrition data)
3. Run audit script: count products, verify cohort fields populated
4. Run opinion pipeline on 50 pilot products → manual review
5. If pilot looks good: full run
6. Apply migration `0009_core_scores_opinion.sql`
7. Update PDP + homepage to read `opinion`
8. Iterate on prompt (cheap — just re-run for affected verdicts)

## What this does NOT do

- Replace V9 scoring (the numbers stay deterministic)
- Replace the rule-based sublabel chips (they drive filtering)
- Run on every page request (cached in DB)
- Touch ingredient intelligence (we don't trust LLMs to classify foods anymore)

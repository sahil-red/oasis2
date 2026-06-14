/**
 * Search V2 intent — SEARCH_V2_PLAN.md §6 L3
 *
 * Fast-path (latency): numeric extraction + exact brand/type from enriched index data.
 * Default: LLM intent (Groq → DeepSeek escalation) + semantic cache.
 * No synonym maps, head-noun rules, or goal dictionaries.
 */
import type { AiSearchPreferences } from "@/lib/search/ai-usage";
import { mergeSavedPreferences } from "@/lib/search/merge-preferences";
import { getCachedIntent, setCachedIntent, type CachedIntentResult } from "@/lib/search/v2/intent-cache";
import { parseIntentWithLlm } from "@/lib/search/v2/llm-intent";
import {
  countActiveConstraints,
  extractNumericConstraints,
  fastPathEligible,
} from "@/lib/search/v2/numeric-constraints";
import type { IndexCatalogMeta } from "@/lib/search/v2/index-meta";
import type { SearchIntentV2 } from "@/lib/search/v2/types";

export type ResolveIntentResult = {
  intent: SearchIntentV2;
  llm_calls: number;
};

function applyPreferencesToIntent(
  intent: SearchIntentV2,
  prefs: AiSearchPreferences | null | undefined,
): SearchIntentV2 {
  if (!prefs) return intent;
  const merged = mergeSavedPreferences(
    {
      product_terms: intent.primary_type ? [intent.primary_type] : [],
      search_keywords: [],
      exclude_keywords: [],
      categories: [],
      hard_constraints: {
        max_price: intent.constraints.max_price,
        max_sugar_g_100g: intent.constraints.max_sugar_g,
        max_fat_g_100g: intent.constraints.max_fat_g,
        min_protein_g_100g: intent.constraints.min_protein_g,
        vegan: intent.constraints.vegan,
        vegetarian: intent.constraints.vegetarian,
        avoid_ingredients: intent.constraints.avoid_ingredients,
        allergens_excluded: intent.constraints.allergens_excluded,
      },
      soft_preferences: [],
      health_contexts: [],
      sort_intent:
        intent.sort === "highest_protein"
          ? "highest_protein"
          : intent.sort === "cheapest"
            ? "cheapest"
            : intent.sort === "healthiest"
              ? "healthiest"
              : "best_match",
      explanation: "",
    },
    prefs,
  );

  const c = merged.hard_constraints;
  return {
    ...intent,
    constraints: {
      ...intent.constraints,
      max_price: c.max_price ?? intent.constraints.max_price,
      max_sugar_g: c.max_sugar_g_100g ?? intent.constraints.max_sugar_g,
      vegan: c.vegan ?? intent.constraints.vegan,
      vegetarian: c.vegetarian ?? intent.constraints.vegetarian,
      avoid_ingredients: c.avoid_ingredients ?? intent.constraints.avoid_ingredients,
      allergens_excluded: c.allergens_excluded ?? intent.constraints.allergens_excluded,
    },
  };
}

function buildFastPathIntent(
  query: string,
  meta: IndexCatalogMeta,
  numeric: ReturnType<typeof extractNumericConstraints>,
): SearchIntentV2 | null {
  const norm = (s: string) => s.toLowerCase().replace(/['']/g, "").trim();
  const residual = numeric.residual_text.toLowerCase().trim();

  // Fast-path eligibility runs on residual (constraint words stripped), but
  // type/brand discovery uses the FULL query so tokens consumed by numeric
  // extraction ("high protein" in "high protein low sugar") are still available.
  // When residual is empty (all tokens were constraint phrases), check the
  // full query — "sugar free" should still match the Sugar Free brand.
  const effective = residual || query.toLowerCase().trim();
  if (!fastPathEligible(effective, meta)) return null;

  // §3.1 — Use full query for type/brand discovery. The residual had constraint
  // words stripped, but those words include valid types ("protein", "sugar").
  // Also strip constraint phrases so fast-path doesn't match them as types/brands.
  // Fall back to original query when everything was stripped (bare "sugar free").
  const CONSTRAINT_STRIP = /\b(?:high(?:est)?\s+protein|higher\s+protein|more\s+protein|most\s+protein|low(?:er|est)?\s+(?:sugar|fat|calorie)|less\s+(?:sugar|fat|calorie)|zero\s+(?:sugar|fat|calorie)|no\s+(?:sugar|fat|calorie|added\s+sugar)|sugar[\s-]free|fat[\s-]free|dairy[\s-]free|lactose[\s-]free|calorie[\s-]free|cheapest|cheap|budget|lowest\s+price|healthiest|cleanest)\b/gi;
  const stripped = query.toLowerCase().trim()
    .replace(CONSTRAINT_STRIP, " ")
    .replace(/\s+/g, " ")
    .trim();
  const fullText = stripped || query.toLowerCase().trim();

  // §3.2 — Strip negation-prefixed tokens ("no dairy", "bina cheeni", "without oil")
  // before matching so we don't set primary_type to the negated token.
  const NEGATION_WORDS = new Set(["no", "not", "without", "bina", "bagair", "nahi", "nako"]);
  const rawTokens = fullText.split(/\s+/);
  const safeTokens: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    if (NEGATION_WORDS.has(rawTokens[i]!) && i + 1 < rawTokens.length) {
      i++; // skip the negated token
      continue;
    }
    safeTokens.push(rawTokens[i]!);
  }
  const tokens = safeTokens.filter(Boolean);
  const normTokens = tokens.map((t) => norm(t));

  let brand: string | null = null;
  let primary_type: string | null = null;
  const required_flavours: string[] = [];
  let kind: SearchIntentV2["kind"] = "directed";

  // Multi-token: check if the full residual is a known brand or type before
  // tokenizing. Handles multi-word brands like "karachi bakery" where individual
  // tokens don't match the stored brand name.
  const fullNorm = norm(fullText);
  if (tokens.length >= 2) {
    if (meta.brands.has(fullNorm)) {
      brand = residual;
      kind = "brand";
    } else if (meta.primaryTypes.has(fullNorm)) {
      primary_type = residual;
      kind = "directed";
    }
  }

  // Check consecutive token pairs for multi-word brands/types.
  // "slurrp farm millet snacks" → pair "slurrp farm" matches brand "slurrp farm"
  let pairConsumedStart = -1;
  let pairConsumedEnd = -1;
  if (!brand && !primary_type && tokens.length >= 3) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const pair = normTokens[i]! + " " + normTokens[i + 1]!;
      if (!brand && meta.brands.has(pair)) {
        brand = tokens.slice(i, i + 2).join(" ");
        kind = "brand";
        pairConsumedStart = i;
        pairConsumedEnd = i + 1;
      }
      if (!primary_type && meta.primaryTypes.has(pair)) {
        primary_type = tokens.slice(i, i + 2).join(" ");
        kind = "directed";
        pairConsumedStart = i;
        pairConsumedEnd = i + 1;
      }
    }
  }

  // Scan individual tokens for remaining brand/type.
  // For "slurrp farm millet snacks": brand="slurrp farm" found by pair check,
  // then "millet" found as primary_type here.
  if (!brand || !primary_type) {
    for (let i = 0; i < tokens.length; i++) {
      if (i >= pairConsumedStart && i <= pairConsumedEnd) continue;
      const t = normTokens[i]!;
      if (!primary_type && meta.primaryTypes.has(t)) {
        primary_type = tokens[i]!;
        if (!brand) kind = "directed";
      } else if (!brand && meta.brands.has(t)) {
        brand = tokens[i]!;
        kind = "brand";
      }
    }
  }

  // §3.3 — Pair-type priority: when primary_type was set by a pair match but
  // an individual known type token exists at an EARLIER position, prefer the
  // individual token. "navratri fasting snacks sendha namak": "snacks" (idx 2)
  // < "sendha namak" pair (idx 3-4) → primary_type="snacks", not a salt product.
  if (primary_type && pairConsumedStart > 0) {
    for (let i = 0; i < pairConsumedStart; i++) {
      if (meta.primaryTypes.has(normTokens[i]!)) {
        primary_type = tokens[i]!;
        break;
      }
    }
  }

  if (!brand && !primary_type) {
  if (tokens.length === 1) {
    if (meta.brands.has(normTokens[0]!)) {
      brand = tokens[0]!;
      kind = "brand";
    } else {
      primary_type = tokens[0]!;
    }
  } else {
    // Multi-token: find the primary_type and brand, collect remaining as flavours
    let brandIdx = -1;
    let typeIdx = -1;
    for (let i = 0; i < tokens.length; i++) {
      if (meta.primaryTypes.has(normTokens[i]!) && typeIdx === -1) typeIdx = i;
      else if (meta.brands.has(normTokens[i]!) && brandIdx === -1) brandIdx = i;
    }

    if (typeIdx >= 0 && brandIdx >= 0) {
      brand = tokens[brandIdx]!;
      primary_type = tokens[typeIdx]!;
    } else if (typeIdx >= 0) {
      primary_type = tokens[typeIdx]!;
      // Remaining tokens that are known flavours → preserve as required_flavours
      for (let i = 0; i < tokens.length; i++) {
        if (i === typeIdx) continue;
        if (meta.flavours.has(normTokens[i]!)) required_flavours.push(tokens[i]!);
      }
    } else if (brandIdx >= 0) {
      brand = tokens[brandIdx]!;
    } else {
      // No type or brand found — use first as type, rest as flavours
      primary_type = tokens[0]!;
      for (let i = 1; i < tokens.length; i++) {
        if (meta.flavours.has(normTokens[i]!)) required_flavours.push(tokens[i]!);
      }
    }
  }
  }

  const modifiers: string[] = [];
  if (numeric.high_protein_tier && primary_type) modifiers.push("high_protein_tier");
  if (numeric.low_sugar_tier && primary_type) modifiers.push("low_sugar");
  if (numeric.no_added_sugar) modifiers.push("no_added_sugar");

  return {
    kind,
    goal_phrase: null,
    goal_id: null,
    brand,
    primary_type,
    use_case: null,
    required_flavours,
    modifiers,
    constraints: {
      max_price: numeric.max_price,
      max_sugar_g: numeric.max_sugar_g,
      max_fat_g: numeric.max_fat_g,
      min_protein_g: primary_type ? undefined : numeric.min_protein_g,
      avoid_ingredients: [],
      allergens_excluded: [],
    },
    constraint_priorities: [],
    sort: numeric.sort,
    comparison_ref: numeric.comparison_ref ?? null,
    comparison_mode: numeric.comparison_mode ?? null,
    confidence: 0.92,
    intent_source: "fast-path",
    raw_query: query,
  };
}

/**
 * Resolve query intent — fast-path when obvious, else LLM (§6).
 */
export async function resolveSearchIntent(
  rawQuery: string,
  opts: {
    preferences?: AiSearchPreferences | null;
    catalogMeta: IndexCatalogMeta;
  },
): Promise<ResolveIntentResult> {
  const query = rawQuery.trim();
  const cached = await getCachedIntent(query, opts.preferences);
  if (cached.intent) return { intent: applyPreferencesToIntent(cached.intent, opts.preferences), llm_calls: 0 };

  const numeric = extractNumericConstraints(query);
  const fast = buildFastPathIntent(query, opts.catalogMeta, numeric);
  if (fast && countActiveConstraints(numeric) <= 2) {
    const intent = applyPreferencesToIntent(fast, opts.preferences);
    return { intent, llm_calls: 0 };
  }

  try {
    const { intent: llmIntent, llm_calls } = await parseIntentWithLlm(query, {
      escalateDeepseek: countActiveConstraints(numeric) >= 2,
      catalogMeta: opts.catalogMeta,
    });
    const intent = applyPreferencesToIntent(
      {
        ...llmIntent,
        constraints: {
          ...llmIntent.constraints,
          // Merge LLM constraints with regex-extracted constraints: regex fills gaps
          // that the LLM may have missed (e.g. "under 5g sugar"), but LLM constraints
          // (e.g. "less than 10g carbs" — not in regex patterns) are PRESERVED.
          max_price: llmIntent.constraints.max_price ?? numeric.max_price,
          max_sugar_g: llmIntent.constraints.max_sugar_g ?? numeric.max_sugar_g,
          max_fat_g: llmIntent.constraints.max_fat_g ?? numeric.max_fat_g,
          min_protein_g: llmIntent.constraints.min_protein_g ?? numeric.min_protein_g,
        },
      },
      opts.preferences,
    );
    void setCachedIntent(query, intent, opts.preferences, cached.embedding);
    return { intent, llm_calls };
  } catch {
    // Try fast-path as fallback before degraded — fast-path (confidence 0.92,
    // correct type/brand matching) is better than degraded (confidence 0.3,
    // no flavours, no modifiers) for most queries.
    const fastFallback = buildFastPathIntent(query, opts.catalogMeta, numeric);
    if (fastFallback) {
      return { intent: applyPreferencesToIntent(fastFallback, opts.preferences), llm_calls: 0 };
    }

    // §9 degradation: exact index token match only — no substring rules
    const norm = (s: string) => s.toLowerCase().replace(/['']/g, "").trim();
    const residual = numeric.residual_text.toLowerCase().trim();
    const normResidual = norm(residual);
    let primary_type: string | null = null;
    let brand: string | null = null;
    if (opts.catalogMeta.primaryTypes.has(normResidual)) {
      primary_type = residual;
    } else if (opts.catalogMeta.brands.has(normResidual)) {
      brand = residual;
    }

    // §9 degradation: exact index token match only — no substring rules
    const degraded: SearchIntentV2 = {
      kind: brand ? "brand" : "directed",
      goal_phrase: null,
      goal_id: null,
      brand,
      primary_type,
      use_case: null,
      required_flavours: [],
      modifiers: numeric.high_protein_tier ? ["high_protein_tier"] : [],
      constraints: {
        max_price: numeric.max_price,
        max_sugar_g: numeric.max_sugar_g,
        max_fat_g: numeric.max_fat_g,
        min_protein_g: numeric.min_protein_g,
        avoid_ingredients: [],
        allergens_excluded: [],
      },
      constraint_priorities: [],
      sort: numeric.sort,
      comparison_ref: numeric.comparison_ref ?? null,
      comparison_mode: numeric.comparison_mode ?? null,
      confidence: 0.3,
      intent_source: "degraded",
      raw_query: query,
    };
    return { intent: applyPreferencesToIntent(degraded, opts.preferences), llm_calls: 0 };
  }
}

/** @deprecated sync alias — use resolveSearchIntent */
export function parseSearchIntent(): never {
  throw new Error("parseSearchIntent is async — use resolveSearchIntent()");
}

export const parseSearchIntentV2 = resolveSearchIntent;

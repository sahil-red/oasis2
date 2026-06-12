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
import { classifyIntentWithPython } from "@/lib/search/python-classifier";
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
  if (!residual || !fastPathEligible(residual, meta)) return null;

  const tokens = residual.split(/\s+/).filter(Boolean);
  const normTokens = tokens.map((t) => norm(t));

  let brand: string | null = null;
  let primary_type: string | null = null;
  const required_flavours: string[] = [];
  let kind: SearchIntentV2["kind"] = "directed";

  // Multi-token: check if the full residual is a known brand or type before
  // tokenizing. Handles multi-word brands like "karachi bakery" where individual
  // tokens don't match the stored brand name.
  const fullNorm = norm(residual);
  if (tokens.length >= 2) {
    if (meta.brands.has(fullNorm)) {
      brand = residual;
      kind = "brand";
    } else if (meta.primaryTypes.has(fullNorm)) {
      primary_type = residual;
      kind = "directed";
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

  // Try Python intent classifier before expensive LLM call (5-50ms vs 2-5s).
  // Falls through silently on failure → LLM handles it as before.
  try {
    const pyIntent = await classifyIntentWithPython(query, opts.catalogMeta);
    if (pyIntent) {
      const merged = {
        ...pyIntent,
        constraints: {
          ...pyIntent.constraints,
          max_price: pyIntent.constraints.max_price ?? numeric.max_price,
          max_sugar_g: pyIntent.constraints.max_sugar_g ?? numeric.max_sugar_g,
          max_fat_g: pyIntent.constraints.max_fat_g ?? numeric.max_fat_g,
          min_protein_g: pyIntent.constraints.min_protein_g ?? numeric.min_protein_g,
        },
      };
      const intent = applyPreferencesToIntent(merged, opts.preferences);
      void setCachedIntent(query, intent, opts.preferences, cached.embedding);
      return { intent, llm_calls: 0 };
    }
  } catch {
    // Python service unavailable — fall through to LLM
  }

  try {
    const { intent: llmIntent, llm_calls } = await parseIntentWithLlm(query, {
      escalateDeepseek: countActiveConstraints(numeric) >= 2,
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

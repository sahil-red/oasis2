/**
 * Search V2 intent — SEARCH_V2_PLAN.md §6 L3
 *
 * Fast-path (latency): numeric extraction + exact brand/type from enriched index data.
 * Default: LLM intent (Groq → DeepSeek escalation) + semantic cache.
 * No synonym maps, head-noun rules, or goal dictionaries.
 */
import type { AiSearchPreferences } from "@/lib/search/ai-usage";
import { mergeSavedPreferences } from "@/lib/search/merge-preferences";
import { getCachedIntent, setCachedIntent } from "@/lib/search/v2/intent-cache";
import { parseIntentWithLlm } from "@/lib/search/v2/llm-intent";
import {
  countActiveConstraints,
  extractNumericConstraints,
  requiresLlmIntent,
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
  if (requiresLlmIntent(query)) return null;

  const residual = numeric.residual_text.toLowerCase().trim();
  if (!residual) return null;

  const tokens = residual.split(/\s+/).filter(Boolean);

  let brand: string | null = null;
  let primary_type: string | null = null;
  let kind: SearchIntentV2["kind"] = "directed";

  if (tokens.length === 1) {
    if (meta.brands.has(tokens[0]!)) {
      brand = tokens[0]!;
      kind = "brand";
    } else if (meta.primaryTypes.has(tokens[0]!)) {
      primary_type = tokens[0]!;
    } else {
      return null;
    }
  } else if (tokens.length === 2) {
    const [a, b] = tokens;
    if (meta.brands.has(a!) && meta.primaryTypes.has(b!)) {
      brand = a!;
      primary_type = b!;
    } else if (meta.brands.has(b!) && meta.primaryTypes.has(a!)) {
      brand = b!;
      primary_type = a!;
    } else {
      return null;
    }
  } else {
    return null;
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
    required_flavours: [],
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
  if (cached) return { intent: applyPreferencesToIntent(cached, opts.preferences), llm_calls: 0 };

  const numeric = extractNumericConstraints(query);
  const fast = buildFastPathIntent(query, opts.catalogMeta, numeric);
  if (fast && countActiveConstraints(numeric) <= 2) {
    const intent = applyPreferencesToIntent(fast, opts.preferences);
    void setCachedIntent(query, intent, opts.preferences);
    return { intent, llm_calls: 0 };
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
          max_price: llmIntent.constraints.max_price ?? numeric.max_price,
          max_sugar_g: llmIntent.constraints.max_sugar_g ?? numeric.max_sugar_g,
          max_fat_g: llmIntent.constraints.max_fat_g ?? numeric.max_fat_g,
        },
      },
      opts.preferences,
    );
    void setCachedIntent(query, intent, opts.preferences);
    return { intent, llm_calls };
  } catch {
    const residual = numeric.residual_text.toLowerCase().trim();
    let primary_type: string | null = null;
    if (opts.catalogMeta.primaryTypes.has(residual)) {
      primary_type = residual;
    } else {
      for (const pt of opts.catalogMeta.primaryTypes) {
        if (residual.includes(pt) && pt.length >= (primary_type?.length ?? 0)) {
          primary_type = pt;
        }
      }
    }

    // §9 degradation: minimal numeric-only intent keeps search alive
    const degraded: SearchIntentV2 = {
      kind: "directed",
      goal_phrase: null,
      goal_id: null,
      brand: null,
      primary_type,
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

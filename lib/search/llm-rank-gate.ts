import { resolveDeepseekApiKey } from "@/lib/search/deepseek-keys";
import type { SearchIntentTier } from "@/lib/search/intent-classify";
import type { ParsedProductQuery } from "@/lib/search/query-parse";
import type { SemanticRankResult } from "@/lib/search/semantic-rank";

export const STRUCTURED_ESCALATE_MIN = 6;

/**
 * True when the query carries semantic intent the LLM can act on:
 * health goals, ingredient avoidance, attribute preferences, non-default sort.
 * These are exactly the cases where LLM ranking adds meaningful value over
 * keyword scoring — reordering by intent, generating precise reason chips,
 * catching soft signals deterministic scoring can't weigh properly.
 */
function hasSemanticIntent(parsed: ParsedProductQuery): boolean {
  return (
    parsed.soft_preferences.length > 0 ||
    parsed.health_contexts.length > 0 ||
    (parsed.hard_constraints.avoid_ingredients ?? []).length > 0 ||
    (parsed.hard_constraints.avoid_sublabels ?? []).length > 0 ||
    parsed.hard_constraints.max_sugar_g_100g != null ||
    parsed.hard_constraints.max_fat_g_100g != null ||
    parsed.hard_constraints.min_protein_g_100g != null ||
    parsed.hard_constraints.max_price != null ||
    parsed.hard_constraints.vegetarian === true ||
    parsed.hard_constraints.vegan === true ||
    parsed.sort_intent !== "best_match" ||
    parsed.categories.length > 0
  );
}

/** When to call DeepSeek rank. */
export function shouldUseLlmRank(
  tier: SearchIntentTier,
  parsed: ParsedProductQuery,
  deterministic: SemanticRankResult,
  candidateCount: number,
  _limit: number,
): boolean {
  if (!resolveDeepseekApiKey("search")) return false;
  if (candidateCount === 0 || deterministic.rankings.length === 0) return false;

  // Always use for complex intent
  if (tier === "complex") return true;

  // Always use when the query has semantic intent — health goals, constraints, preferences.
  // LLM adds real value here: it can reason about "grass-fed", "no palm oil confirmed",
  // "best for PCOS" etc. in ways keyword scoring can't.
  if (hasSemanticIntent(parsed)) return true;

  // For plain product lookups (no constraints, no context), use LLM only when:
  // - deterministic struggled (relaxed, few results, or low-confidence top match)
  if (deterministic.relaxed) return true;
  if (deterministic.rankings.length < 4) return true;
  const topMatch = deterministic.rankings[0]?.score ?? 0;
  if (topMatch < 50) return true;

  // Plain single-noun queries ("matcha", "paneer", "oats") — deterministic is
  // good enough, save the LLM call.
  return false;
}

/** Escalate to complex if structured returned too few results and query has no product noun. */
export function shouldEscalateStructuredToComplex(
  tier: SearchIntentTier,
  itemCount: number,
  parsed: ParsedProductQuery,
  limit: number,
): boolean {
  if (tier !== "structured") return false;
  if (!resolveDeepseekApiKey("search")) return false;
  // Escalate even when there are product terms — useful for vague intent queries
  return itemCount < Math.min(STRUCTURED_ESCALATE_MIN, Math.max(4, Math.floor(limit / 2)));
}

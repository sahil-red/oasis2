import { resolveDeepseekApiKey } from "@/lib/search/deepseek-keys";
import type { SearchIntentTier } from "@/lib/search/intent-classify";
import type { ParsedProductQuery } from "@/lib/search/query-parse";
import type { SemanticRankResult } from "@/lib/search/semantic-rank";

export const STRUCTURED_ESCALATE_MIN = 6;

/** When to call DeepSeek rank — complex intent, or structured search did not produce a solid list. */
export function shouldUseLlmRank(
  tier: SearchIntentTier,
  parsed: ParsedProductQuery,
  deterministic: SemanticRankResult,
  candidateCount: number,
  limit: number,
): boolean {
  if (!resolveDeepseekApiKey("search")) return false;
  if (candidateCount === 0 || deterministic.rankings.length === 0) return false;

  if (tier === "complex") return true;

  const minItems = Math.min(STRUCTURED_ESCALATE_MIN, Math.max(4, Math.floor(limit / 2)));
  const enoughResults = deterministic.rankings.length >= minItems;

  if (parsed.product_terms.length > 0 && enoughResults && !deterministic.relaxed) {
    return false;
  }

  if (deterministic.relaxed) return true;
  if (!enoughResults) return true;

  const topMatch = deterministic.rankings[0]?.score ?? 0;
  if (topMatch < 40) return true;

  return false;
}

/** Client may re-request with complex tier after a sparse structured response. */
export function shouldEscalateStructuredToComplex(
  tier: SearchIntentTier,
  itemCount: number,
  parsed: ParsedProductQuery,
  limit: number,
): boolean {
  if (tier !== "structured") return false;
  if (!resolveDeepseekApiKey("search")) return false;
  if (parsed.product_terms.length > 0) return false;
  return itemCount < Math.min(STRUCTURED_ESCALATE_MIN, Math.max(4, Math.floor(limit / 2)));
}

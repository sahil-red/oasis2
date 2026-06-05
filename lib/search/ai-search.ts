import { mergeUsage } from "@/lib/search/deepseek-client";
import { resolveDeepseekApiKey } from "@/lib/search/deepseek-keys";
import { retrieveCandidates } from "@/lib/search/ai-retrieval";
import { rankCandidatesWithDeepseek } from "@/lib/search/ai-rank";
import {
  healthContextGoalFit,
  mergeDeterministicWithLlmRankings,
  rankCandidatesSemantically,
} from "@/lib/search/semantic-rank";
import type { SearchIntentTier } from "@/lib/search/intent-classify";
import { getAiSearchProductPool, type CatalogGridItem, type ProductListItem } from "@/lib/products/queries";
import type { ParsedProductQuery, QueryParseResult } from "@/lib/search/query-parse";

export type AiSearchItem = CatalogGridItem & {
  ai_match_score: number;
  /** Goal-fit or core score — shown on the Health tab in search cards. */
  ai_health_score?: number;
  ai_match_reasons: string[];
  ai_match_warning?: string | null;
};

export type AiSearchResult = {
  parsed: ParsedProductQuery;
  parse_source: QueryParseResult["source"];
  rank_source: "deepseek" | "fallback" | "semantic";
  intent_tier: SearchIntentTier;
  parse_warning?: string;
  rank_warning?: string;
  summary: string;
  items: AiSearchItem[];
  reasons_by_product_id: Record<string, string[]>;
  refinements: string[];
  usage?: QueryParseResult["usage"];
  limit: number;
  total: number;
  relaxed: boolean;
};

const STRUCTURED_ESCALATE_MIN = 6;

function toAiGridItem(
  p: ProductListItem,
  parsed: ParsedProductQuery,
  score: number,
  reasons: string[],
  warning: string | null,
): AiSearchItem {
  const healthScore =
    healthContextGoalFit(p, parsed) ?? p.core_scores?.score ?? undefined;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category,
    subcategory: p.subcategory,
    net_weight: p.net_weight,
    price_inr: p.price_inr,
    mrp_inr: p.mrp_inr,
    image_urls: p.image_urls?.length ? [p.image_urls[0]] : [],
    core_scores: p.core_scores
      ? {
          score: p.core_scores.score,
          grade: p.core_scores.grade,
          band: p.core_scores.band,
          verdict: p.core_scores.verdict ?? null,
          verdict_sublabels: p.core_scores.verdict_sublabels ?? [],
          relative_score: p.core_scores.relative_score ?? null,
          cohort_size: p.core_scores.cohort_size ?? null,
        }
      : null,
    ai_match_score: score,
    ai_health_score: healthScore,
    ai_match_reasons: reasons,
    ai_match_warning: warning,
  };
}

function suggestedRefinements(parsed: ParsedProductQuery): string[] {
  const out: string[] = [];
  if (!parsed.hard_constraints.max_price) out.push("Add a budget, e.g. under ₹150");
  if (!parsed.hard_constraints.max_sugar_g_100g) out.push("Add a sugar limit");
  if (!parsed.health_contexts.length) out.push("Add a goal like diabetic, kids, gym, or fat loss");
  if (!parsed.hard_constraints.vegetarian && !parsed.hard_constraints.vegan) {
    out.push("Specify vegetarian or vegan if needed");
  }
  return out.slice(0, 3);
}

export async function runAiProductSearch(
  parseResult: QueryParseResult,
  opts: { limit?: number; prompt?: string; tier?: SearchIntentTier } = {},
): Promise<AiSearchResult> {
  const limit = Math.min(40, Math.max(4, opts.limit ?? 24));
  const parsed = parseResult.parsed;
  const prompt = opts.prompt?.trim() || parsed.explanation;
  const tier = opts.tier ?? "structured";

  const catalog = await getAiSearchProductPool();
  const candidates = retrieveCandidates(catalog, parsed, 100);
  const byId = new Map(candidates.map((p) => [p.id, p]));

  const semanticCap = Math.min(40, Math.max(limit, limit * 2));
  const deterministic = rankCandidatesSemantically(candidates, parsed, semanticCap);
  const rankingsForUi = deterministic.rankings.slice(0, limit);

  let summary = deterministic.summary;
  let rankings = rankingsForUi;
  let usage: QueryParseResult["usage"] = null;
  let rankSource: AiSearchResult["rank_source"] = "semantic";
  let rankWarning: string | undefined;

  const gatedIds = new Set(deterministic.rankings.map((r) => r.product_id));
  const gatedForLlm = deterministic.rankings
    .map((r) => byId.get(r.product_id))
    .filter((p): p is ProductListItem => !!p);

  if (tier === "complex" && resolveDeepseekApiKey("search") && gatedForLlm.length > 0) {
    const llm = await rankCandidatesWithDeepseek(prompt, parsed, gatedForLlm, limit);
    usage = llm.usage;
    rankWarning = llm.warning;
    if (llm.rankings.length > 0) {
      summary = llm.summary;
      rankings = mergeDeterministicWithLlmRankings(
        rankingsForUi,
        llm.rankings,
        gatedIds,
        limit,
      );
      rankSource = llm.source === "deepseek" ? "deepseek" : "semantic";
    }
  }

  const items: AiSearchItem[] = [];
  for (const row of rankings) {
    const p = byId.get(row.product_id);
    if (!p) continue;
    items.push(toAiGridItem(p, parsed, row.score, row.reasons, row.warning ?? null));
  }

  return {
    parsed,
    parse_source: parseResult.source,
    rank_source: rankSource,
    intent_tier: tier,
    parse_warning: parseResult.warning,
    rank_warning: rankWarning,
    summary,
    items,
    reasons_by_product_id: Object.fromEntries(
      rankings.map((r) => [r.product_id, r.reasons]),
    ),
    refinements: tier === "complex" ? suggestedRefinements(parsed) : [],
    usage: mergeUsage(parseResult.usage, usage),
    limit,
    total: candidates.length,
    relaxed: deterministic.relaxed,
  };
}

/** Structured first; escalate to complex when results are sparse and search key exists. */
export function shouldEscalateStructuredToComplex(
  tier: SearchIntentTier,
  result: AiSearchResult,
  limit: number,
): boolean {
  if (tier !== "structured") return false;
  if (!resolveDeepseekApiKey("search")) return false;
  // Named product type (e.g. buttermilk, paneer): sparse matches are OK — don't re-parse + LLM rank.
  if (result.parsed.product_terms.length > 0) return false;
  return result.items.length < Math.min(STRUCTURED_ESCALATE_MIN, Math.max(4, Math.floor(limit / 2)));
}

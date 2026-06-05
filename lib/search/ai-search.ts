import { mergeUsage } from "@/lib/search/deepseek-client";
import { retrieveCandidates } from "@/lib/search/ai-retrieval";
import { rankCandidatesWithDeepseek } from "@/lib/search/ai-rank";
import { getAiSearchProductPool, type CatalogGridItem, type ProductListItem } from "@/lib/products/queries";
import type { ParsedProductQuery, QueryParseResult } from "@/lib/search/query-parse";

export type AiSearchItem = CatalogGridItem & {
  ai_match_score: number;
  ai_match_reasons: string[];
  ai_match_warning?: string | null;
};

export type AiSearchResult = {
  parsed: ParsedProductQuery;
  parse_source: QueryParseResult["source"];
  rank_source: "deepseek" | "fallback";
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

function toAiGridItem(p: ProductListItem, score: number, reasons: string[], warning: string | null): AiSearchItem {
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
    ai_match_reasons: reasons,
    ai_match_warning: warning,
  };
}

function suggestedRefinements(parsed: ParsedProductQuery): string[] {
  const out: string[] = [];
  if (!parsed.hard_constraints.max_price) out.push("Add a budget, e.g. under ₹150");
  if (!parsed.hard_constraints.max_sugar_g_100g) out.push("Add a sugar limit");
  if (!parsed.health_contexts.length) out.push("Add a goal like diabetic, kids, gym, or fat loss");
  if (!parsed.hard_constraints.vegetarian) out.push("Specify vegetarian or vegan if needed");
  return out.slice(0, 3);
}

export async function runAiProductSearch(
  parseResult: QueryParseResult,
  opts: { limit?: number; prompt?: string } = {},
): Promise<AiSearchResult> {
  const limit = Math.min(40, Math.max(4, opts.limit ?? 24));
  const parsed = parseResult.parsed;
  const prompt = opts.prompt?.trim() || parsed.explanation;

  const catalog = await getAiSearchProductPool();
  const candidates = retrieveCandidates(catalog, parsed, 100);

  const rank = await rankCandidatesWithDeepseek(prompt, parsed, candidates, limit);

  const byId = new Map(candidates.map((p) => [p.id, p]));
  const items: AiSearchItem[] = [];
  for (const row of rank.rankings) {
    const p = byId.get(row.product_id);
    if (!p) continue;
    items.push(toAiGridItem(p, row.score, row.reasons, row.warning ?? null));
  }

  const relaxed = false;

  return {
    parsed,
    parse_source: parseResult.source,
    rank_source: rank.source,
    parse_warning: parseResult.warning,
    rank_warning: rank.warning,
    summary: rank.summary,
    items,
    reasons_by_product_id: Object.fromEntries(
      rank.rankings.map((r) => [r.product_id, r.reasons]),
    ),
    refinements: suggestedRefinements(parsed),
    usage: mergeUsage(parseResult.usage, rank.usage),
    limit,
    total: candidates.length,
    relaxed,
  };
}

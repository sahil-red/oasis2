import { computeGoalFit, resolveGoalWeights } from "@/lib/search/v2/goal-graph";
import { buildReasons } from "@/lib/search/v2/explain";
import type {
  GoalTraitMapRow,
  ProductSearchIndexRow,
  RankedCandidate,
  SearchIntentV2,
} from "@/lib/search/v2/types";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function relevanceScore(row: ProductSearchIndexRow, intent: SearchIntentV2): number {
  const q = intent.raw_query.toLowerCase();
  const doc = row.search_doc ?? "";
  let score = 0;
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  for (const t of tokens) {
    if (doc.includes(t)) score += 0.12;
  }
  if (intent.primary_type && row.primary_type === intent.primary_type) score += 0.35;
  if (intent.required_flavours.length) {
    const hit = intent.required_flavours.every(
      (f) => row.flavours.includes(f) || row.name.toLowerCase().includes(f),
    );
    if (hit) score += 0.25;
  }
  if (intent.kind === "brand" && row.brand?.toLowerCase().includes(q)) score += 0.4;
  return clamp01(score);
}

function healthScore(row: ProductSearchIndexRow): number {
  if (row.scout_score == null) return 0.45;
  return clamp01(row.scout_score / 100);
}

function popularityScore(row: ProductSearchIndexRow): number {
  const searches = row.search_count ?? 0;
  const clicks = row.click_count ?? 0;
  const saves = row.save_count ?? 0;
  const raw = searches * 0.2 + clicks * 0.5 + saves * 0.8;
  return clamp01(Math.log1p(raw) / 5);
}

function sortComparator(a: RankedCandidate, b: RankedCandidate, sort: SearchIntentV2["sort"]): number {
  switch (sort) {
    case "cheapest":
      return (a.row.price_inr ?? 1e9) - (b.row.price_inr ?? 1e9);
    case "healthiest":
      return (b.health_score ?? 0) - (a.health_score ?? 0);
    case "highest_protein":
      // §14 relative nutrition: per-type protein_tier when available
      if (a.row.protein_tier && b.row.protein_tier) {
        const tierRank = (t: string | null) =>
          t === "high" ? 3 : t === "medium" ? 2 : t === "low" ? 1 : 0;
        return tierRank(b.row.protein_tier) - tierRank(a.row.protein_tier);
      }
      return (b.row.protein_g ?? 0) - (a.row.protein_g ?? 0);
    case "lowest_sugar":
      return (a.row.sugar_g ?? 1e9) - (b.row.sugar_g ?? 1e9);
    default:
      return b.final_score - a.final_score;
  }
}

export function rankCandidates(
  candidates: ProductSearchIndexRow[],
  intent: SearchIntentV2,
  goalMap?: Map<string, GoalTraitMapRow>,
  limit = 50,
): RankedCandidate[] {
  const goalWeights =
    intent.kind === "goal" && intent.goal_id ? resolveGoalWeights(intent.goal_id, goalMap) : null;

  const ranked: RankedCandidate[] = candidates.map((row) => {
    const relevance_score = relevanceScore(row, intent);
    const health_score = healthScore(row);
    let trait_match_score = 0;
    let goal_fit: number | null = null;

    if (goalWeights) {
      const fit = computeGoalFit(row, goalWeights);
      goal_fit = fit.score;
      trait_match_score = fit.score;
    } else if (intent.modifiers.includes("high_protein_tier")) {
      trait_match_score = row.protein_tier === "high" ? 0.9 : row.protein_tier === "medium" ? 0.5 : 0.2;
    } else if (intent.modifiers.includes("low_sugar")) {
      trait_match_score = row.sugar_tier === "low" ? 0.9 : row.sugar_tier === "medium" ? 0.5 : 0.2;
    }

    const popularity_score = popularityScore(row);
    const final_score = clamp01(
      relevance_score * 0.4 +
        health_score * 0.3 +
        (trait_match_score || relevance_score * 0.5) * 0.2 +
        popularity_score * 0.1,
    );

    return {
      row,
      relevance_score,
      health_score,
      trait_match_score,
      popularity_score,
      final_score,
      goal_fit,
      reasons: buildReasons(row, relevance_score, goalWeights),
      trait_reasons: [],
    };
  });

  ranked.sort((a, b) => {
    const bySort = sortComparator(a, b, intent.sort);
    if (bySort !== 0) return bySort;
    if (b.row.data_quality_score !== a.row.data_quality_score) {
      return b.row.data_quality_score - a.row.data_quality_score;
    }
    return b.final_score - a.final_score;
  });

  return ranked.slice(0, limit);
}

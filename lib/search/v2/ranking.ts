import { computeGoalFit } from "@/lib/search/v2/goal-graph";
import { buildReasons } from "@/lib/search/v2/explain";
import { comparisonBeatScore, type ComparisonContext } from "@/lib/search/v2/comparison";
import { computePopularitySignal } from "@/lib/search/v2/popularity";
import type {
  GoalTraitWeights,
  ProductSearchIndexRow,
  RankedCandidate,
  SearchIntentV2,
} from "@/lib/search/v2/types";

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function minMaxNormalize(values: number[]): number[] {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

function healthScore(row: ProductSearchIndexRow): number {
  if (row.scout_score == null) return 0.45;
  return clamp01(row.scout_score / 100);
}


function constraintSatisfaction(row: ProductSearchIndexRow, intent: SearchIntentV2): number {
  const c = intent.constraints;
  let total = 0;
  let met = 0;
  if (c.max_price != null) {
    total++;
    if (row.price_inr == null || row.price_inr <= c.max_price) met++;
  }
  if (c.max_sugar_g != null) {
    total++;
    if (row.sugar_g == null || row.sugar_g <= c.max_sugar_g) met++;
  }
  if (intent.modifiers.includes("high_protein_tier")) {
    total++;
    if (row.protein_tier === "high" || row.protein_tier === "medium") met++;
  }
  if (intent.modifiers.includes("low_sugar")) {
    total++;
    if (row.sugar_tier === "low" || row.sugar_tier === "medium") met++;
  }
  return total > 0 ? met / total : 0.5;
}

function sortComparator(a: RankedCandidate, b: RankedCandidate, sort: SearchIntentV2["sort"]): number {
  switch (sort) {
    case "cheapest":
      return (a.row.price_inr ?? 1e9) - (b.row.price_inr ?? 1e9);
    case "healthiest":
      return b.health_score - a.health_score;
    case "highest_protein":
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

/** §7b health-aware ranking with min-max normalization within candidate set */
export function rankCandidates(
  candidates: ProductSearchIndexRow[],
  intent: SearchIntentV2,
  relevanceById: Map<string, number>,
  goalWeights: GoalTraitWeights | null,
  limit = 50,
  comparison: ComparisonContext | null = null,
): RankedCandidate[] {
  const hasGoalOrConstraints =
    Boolean(goalWeights && Object.keys(goalWeights).length) ||
    intent.modifiers.length > 0 ||
    Object.values(intent.constraints).some((v) => v != null && (Array.isArray(v) ? v.length : true));

  const relevances = candidates.map((r) => relevanceById.get(r.product_id) ?? 0);
  const healths = candidates.map(healthScore);
  const pops = candidates.map(computePopularitySignal);

  const normRel = minMaxNormalize(relevances);
  const normHealth = minMaxNormalize(healths);
  const normPop = minMaxNormalize(pops);

  const ranked: RankedCandidate[] = candidates.map((row, i) => {
    const relevance_score = normRel[i] ?? 0;
    const health_score = normHealth[i] ?? 0;
    const popularity_score = normPop[i] ?? 0;

    let trait_match_score = constraintSatisfaction(row, intent);
    let goal_fit: number | null = null;
    if (goalWeights && Object.keys(goalWeights).length) {
      const fit = computeGoalFit(row, goalWeights);
      goal_fit = fit.score;
      trait_match_score = fit.score;
    }

    let final_score: number;
    if (!hasGoalOrConstraints) {
      final_score = clamp01(
        relevance_score * 0.55 + health_score * 0.35 + popularity_score * 0.1,
      );
    } else {
      final_score = clamp01(
        relevance_score * 0.4 +
          health_score * 0.3 +
          trait_match_score * 0.2 +
          popularity_score * 0.1,
      );
    }

    if (comparison) {
      const beat = comparisonBeatScore(row, comparison);
      final_score = clamp01(final_score * 0.65 + beat * 0.35);
    }

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

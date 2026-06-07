import { computeGoalFit } from "@/lib/search/v2/goal-graph";
import { buildReasons } from "@/lib/search/v2/explain";
import { comparisonBeatScore, type ComparisonContext } from "@/lib/search/v2/comparison";
import { computePopularitySignal } from "@/lib/search/v2/popularity";
import { useCaseMatchScore } from "@/lib/search/v2/use-case";
import { effectiveTraitScore } from "@/lib/search/v2/traits";
import { calibrateTraitConfidence } from "@/lib/search/v2/trait-calibration";
import type {
  GoalTraitWeights,
  ProductSearchIndexRow,
  RankedCandidate,
  SearchIntentV2,
  TraitId,
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

/** LLM-derived "cleanliness/wholeness" signal — reads the model's ingredient judgment. */
const HEALTH_TRAITS: TraitId[] = ["whole_food", "clean_label", "no_added_sugar", "low_sugar"];

function cleanComposite(row: ProductSearchIndexRow): number | null {
  const vals = HEALTH_TRAITS.map((t) =>
    row.traits[t] != null
      ? effectiveTraitScore(t, row.traits[t], row, calibrateTraitConfidence)
      : null,
  ).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Health = the deterministic Scout score blended with the LLM's ingredient understanding
 * (whole_food / clean_label / no_added_sugar / low_sugar). This is what lets natural coconut
 * water outrank a sugar+preservative one even on a bare "coconut water" query — the flat
 * Scout score alone does not separate them.
 */
function healthScore(row: ProductSearchIndexRow): number {
  const scout = row.scout_score != null ? clamp01(row.scout_score / 100) : null;
  const comp = cleanComposite(row);
  if (scout != null && comp != null) return clamp01(0.5 * scout + 0.5 * comp);
  if (comp != null) return comp;
  if (scout != null) return scout;
  return 0.45;
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
    Boolean(intent.use_case) ||
    intent.modifiers.length > 0 ||
    Object.values(intent.constraints).some((v) => v != null && (Array.isArray(v) ? v.length : true));

  const relevances = candidates.map((r) => relevanceById.get(r.product_id) ?? 0);
  const healths = candidates.map(healthScore);
  const pops = candidates.map(computePopularitySignal);
  const rawTraitMatches = candidates.map((row) => {
    let base: number;
    if (goalWeights && Object.keys(goalWeights).length) {
      base = computeGoalFit(row, goalWeights).score;
    } else {
      base = constraintSatisfaction(row, intent);
    }
    if (intent.use_case) {
      base = clamp01(base * 0.65 + useCaseMatchScore(row, intent.use_case) * 0.35);
    }
    return base;
  });

  const normRel = minMaxNormalize(relevances);
  const normHealth = minMaxNormalize(healths);
  const normPop = minMaxNormalize(pops);
  const normTrait = minMaxNormalize(rawTraitMatches);

  const ranked: RankedCandidate[] = candidates.map((row, i) => {
    const relevance_score = normRel[i] ?? 0;
    const health_score = normHealth[i] ?? 0;
    const popularity_score = normPop[i] ?? 0;
    const trait_match_score = normTrait[i] ?? 0;

    let goal_fit: number | null = null;
    if (goalWeights && Object.keys(goalWeights).length) {
      goal_fit = rawTraitMatches[i] ?? 0;
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

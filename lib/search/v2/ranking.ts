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
    const s = row.total_sugar_g != null && row.total_sugar_g > 0 ? row.total_sugar_g : row.sugar_g;
    if (s == null || s <= c.max_sugar_g) met++;
  }
  if (c.max_fat_g != null) {
    total++;
    const f = row.total_fat_g != null && row.total_fat_g > 0 ? row.total_fat_g : row.fat_g;
    if (f == null || f <= c.max_fat_g) met++;
  }
  if (c.max_calories != null) {
    total++;
    const cal = row.total_calories != null && row.total_calories > 0 ? row.total_calories : row.energy_kcal;
    if (cal == null || cal <= c.max_calories) met++;
  }
  if (c.min_protein_g != null) {
    total++;
    const p = row.total_protein_g != null && row.total_protein_g > 0 ? row.total_protein_g : null;
    const pro = p ?? row.protein_g;
    if (pro == null || pro >= c.min_protein_g) met++;
  }
  return total > 0 ? met / total : 0.5;
}

/** Physics validity for per-100g macros — a percentage cannot exceed 100.
 *  Invalid extraction artifacts (e.g. "500g protein" for per-100g) must not win sorts.
 *  Per-pack total_ columns can legitimately exceed 100g (e.g. 500g protein tub). */
function validGrams(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Min-max normalize values that may be null — nulls land mid-scale so unknown
 *  data neither wins nor loses the dimension. invert=true → lower raw is better. */
function normalizeNullable(values: Array<number | null>, invert = false): number[] {
  const known = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!known.length) return values.map(() => 0.5);
  const min = Math.min(...known);
  const max = Math.max(...known);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => {
    if (v == null || !Number.isFinite(v)) return 0.5;
    const n = (v - min) / (max - min);
    return invert ? 1 - n : n;
  });
}

/** For explicit sorts (highest_protein, cheapest, etc.), type-match tier takes
 *  priority — "milk" products rank above whey that lexically-hallucinated "milk"
 *  in ingredients. Within the same tier the original sort applies. */
/** Exact (0) and centroid-equivalent (1) are the SAME real category — never
 *  split them under a metric sort ("snacks" vs "snack" would bury a 30g item
 *  beneath 9g ones). Only lexical-only (2) and non-matches (99) get demoted —
 *  that guard still stops "high protein milk" surfacing whey that merely names
 *  milk in its ingredients. */
function tierBucket(t: number): number {
  return t <= 1 ? 0 : t;
}
function tieredSort(a: RankedCandidate, b: RankedCandidate): number {
  return tierBucket(a.type_tier) - tierBucket(b.type_tier);
}

function sortComparator(a: RankedCandidate, b: RankedCandidate, sort: SearchIntentV2["sort"]): number {
  switch (sort) {
    case "cheapest": {
      const t = tieredSort(a, b);
      if (t !== 0) return t;
      return (a.row.price_inr ?? 1e9) - (b.row.price_inr ?? 1e9);
    }
    case "healthiest": {
      const t = tieredSort(a, b);
      if (t !== 0) return t;
      return b.health_score - a.health_score;
    }
    case "highest_protein": {
      const t = tieredSort(a, b);
      if (t !== 0) return t;
      // Absolute grams only. Tiers are within-cohort percentiles — comparing
      // them across types ranks a "high"-for-honey 2g above a "medium" 25g whey.
      return (validGrams(b.row.total_protein_g ?? b.row.protein_g) ?? -1) - (validGrams(a.row.total_protein_g ?? a.row.protein_g) ?? -1);
    }
    case "lowest_sugar": {
      const t = tieredSort(a, b);
      if (t !== 0) return t;
      return (validGrams(a.row.sugar_g) ?? 1e9) - (validGrams(b.row.sugar_g) ?? 1e9);
    }
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
  typeTiers?: Map<string, number>,
): RankedCandidate[] {
  const hasGoalOrConstraints =
    Boolean(goalWeights && Object.keys(goalWeights).length) ||
    Boolean(intent.use_case) ||
    intent.modifiers.length > 0 ||
    Object.values(intent.constraints).some((v) => v !== null && v !== undefined && v !== false && (Array.isArray(v) ? v.length > 0 : true));

  const relevances = candidates.map((r) => relevanceById.get(r.product_id) ?? 0);
  const healths = candidates.map(healthScore);
  const pops = candidates.map(computePopularitySignal);

  // Relative asks ("high protein", "low sugar") score by ABSOLUTE nutrition,
  // normalized within this candidate set — the only cohort that matches the
  // user's actual comparison context. Build-time tiers never gate or rank here.
  const proteinNorm = intent.modifiers.includes("high_protein_tier")
    ? normalizeNullable(candidates.map((r) => validGrams(r.total_protein_g ?? r.protein_g)))
    : null;
  const sugarNorm = intent.modifiers.includes("low_sugar")
    ? normalizeNullable(candidates.map((r) => validGrams(r.total_sugar_g ?? r.sugar_g)), true)
    : null;

  const rawTraitMatches = candidates.map((row, i) => {
    let base: number;
    if (goalWeights && Object.keys(goalWeights).length) {
      base = computeGoalFit(row, goalWeights).score;
    } else {
      base = constraintSatisfaction(row, intent);
    }
    if (proteinNorm) base = clamp01(base * 0.4 + proteinNorm[i]! * 0.6);
    if (sugarNorm) base = clamp01(base * 0.4 + sugarNorm[i]! * 0.6);
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
      // Health-first blend with Scout tier floor.
      // Generic queries ("chips") show healthiest options first.
      // Products below Scout 40 get -0.30 penalty, below 65 get -0.10.
      final_score = clamp01(
        health_score * 0.45 + relevance_score * 0.35 + popularity_score * 0.20 -
        (row.scout_score != null && row.scout_score < 40 ? 0.30 :
         row.scout_score != null && row.scout_score < 65 ? 0.10 : 0),
      );
    } else {
      // Constrained queries: user specified a filter — rank valid products by health.
      final_score = clamp01(
        health_score * 0.50 + relevance_score * 0.30 +
          trait_match_score * 0.15 + popularity_score * 0.05,
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
      type_tier: typeTiers?.get(row.product_id) ?? 99,
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

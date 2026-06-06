/**
 * §7c Goal buckets — Best Overall + Best Budget + top-3 traits by goal weight.
 */
import type { GoalTraitWeights, RankedCandidate, RecommendationBucket, TraitId } from "@/lib/search/v2/types";

const TRAIT_LABELS: Partial<Record<TraitId, string>> = {
  hydration: "Best Hydration",
  electrolytes: "Best Electrolytes",
  slow_energy: "Best Endurance",
  quick_energy: "Best Quick Energy",
  protein_density: "Best Protein",
  clean_label: "Cleanest Label",
  whole_food: "Best Whole Food",
  low_sugar: "Lowest Sugar",
  fiber_density: "Best Fiber",
  kid_friendly: "Best for Kids",
  diabetic_friendly: "Best for Diabetics",
};

function topTraitsByWeight(weights: GoalTraitWeights, n = 3): TraitId[] {
  return (Object.entries(weights) as Array<[TraitId, number]>)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => t);
}

export function buildGoalBuckets(
  ranked: RankedCandidate[],
  goalWeights: GoalTraitWeights | null,
  maxPerBucket = 3,
): RecommendationBucket[] | null {
  if (!goalWeights || ranked.length < 2) return null;

  const buckets: RecommendationBucket[] = [];

  const overall = [...ranked]
    .sort(
      (a, b) =>
        (b.goal_fit ?? b.final_score) - (a.goal_fit ?? a.final_score) || b.final_score - a.final_score,
    )
    .slice(0, maxPerBucket);
  buckets.push({
    id: "overall",
    label: "Best Overall",
    trait_focus: "overall",
    items: overall,
  });

  const priced = ranked.filter((r) => r.row.price_inr != null && r.row.price_inr > 0);
  const budget = [...priced]
    .sort((a, b) => {
      const aVal = (a.goal_fit ?? a.final_score) / (a.row.price_inr ?? 1);
      const bVal = (b.goal_fit ?? b.final_score) / (b.row.price_inr ?? 1);
      return bVal - aVal;
    })
    .slice(0, maxPerBucket);
  if (budget.length) {
    buckets.push({
      id: "budget",
      label: "Best Budget",
      trait_focus: "budget",
      items: budget,
    });
  }

  for (const trait of topTraitsByWeight(goalWeights, 3)) {
    const items = [...ranked]
      .sort((a, b) => (b.row.traits[trait] ?? 0) - (a.row.traits[trait] ?? 0))
      .slice(0, maxPerBucket);
    if (!items.length) continue;
    buckets.push({
      id: trait,
      label: TRAIT_LABELS[trait] ?? `Best ${trait.replace(/_/g, " ")}`,
      trait_focus: trait,
      items,
    });
  }

  return buckets.length >= 2 ? buckets : null;
}

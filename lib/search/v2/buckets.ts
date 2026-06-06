/**
 * §7c Goal buckets — Best Overall + Best Budget + top-3 traits by goal weight.
 */
import { calibrateTraitConfidence } from "@/lib/search/v2/trait-calibration";
import { effectiveTraitScore } from "@/lib/search/v2/traits";
import type { GoalTraitWeights, RankedCandidate, RecommendationBucket, TraitId } from "@/lib/search/v2/types";

const MIN_BUCKET_ITEMS = 3;
const DEFAULT_MAX_PER_BUCKET = 4;

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

/** ₹ per 100g (or 100ml for liquids); falls back to pack price when size unknown. */
function pricePer100g(row: RankedCandidate["row"]): number | null {
  const price = row.price_inr;
  if (price == null || price <= 0) return null;
  const val = row.pack_size_value;
  const unit = row.pack_size_unit?.toLowerCase().trim();
  if (!val || val <= 0 || !unit) return price;

  if (unit === "g" || unit === "gm" || unit === "gram" || unit === "grams") {
    return (price / val) * 100;
  }
  if (unit === "kg") {
    return (price / (val * 1000)) * 100;
  }
  if (unit === "ml") {
    return (price / val) * 100;
  }
  if (unit === "l" || unit === "liter" || unit === "litre") {
    return (price / (val * 1000)) * 100;
  }
  return price;
}

function takeBucket(items: RankedCandidate[], maxPerBucket: number): RankedCandidate[] {
  const sliced = items.slice(0, Math.min(5, Math.max(MIN_BUCKET_ITEMS, maxPerBucket)));
  return sliced.length >= MIN_BUCKET_ITEMS ? sliced : [];
}

function traitEffective(row: RankedCandidate["row"], trait: TraitId): number {
  const raw = row.traits[trait];
  return effectiveTraitScore(trait, raw, row, calibrateTraitConfidence);
}

export function buildGoalBuckets(
  ranked: RankedCandidate[],
  goalWeights: GoalTraitWeights | null,
  maxPerBucket = DEFAULT_MAX_PER_BUCKET,
): RecommendationBucket[] | null {
  if (!goalWeights || ranked.length < MIN_BUCKET_ITEMS) return null;

  const buckets: RecommendationBucket[] = [];

  const overall = takeBucket(
    [...ranked].sort(
      (a, b) =>
        (b.goal_fit ?? b.final_score) - (a.goal_fit ?? a.final_score) || b.final_score - a.final_score,
    ),
    maxPerBucket,
  );
  if (overall.length) {
    buckets.push({
      id: "overall",
      label: "Best Overall",
      trait_focus: "overall",
      items: overall,
    });
  }

  const priced = ranked.filter((r) => pricePer100g(r.row) != null);
  const budget = takeBucket(
    [...priced].sort((a, b) => {
      const aPrice = pricePer100g(a.row) ?? 1e9;
      const bPrice = pricePer100g(b.row) ?? 1e9;
      const aVal = (a.goal_fit ?? a.final_score) / aPrice;
      const bVal = (b.goal_fit ?? b.final_score) / bPrice;
      return bVal - aVal;
    }),
    maxPerBucket,
  );
  if (budget.length) {
    buckets.push({
      id: "budget",
      label: "Best Budget",
      trait_focus: "budget",
      items: budget,
    });
  }

  for (const trait of topTraitsByWeight(goalWeights, 3)) {
    const items = takeBucket(
      [...ranked].sort((a, b) => traitEffective(b.row, trait) - traitEffective(a.row, trait)),
      maxPerBucket,
    );
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

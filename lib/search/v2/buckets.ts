import type { GoalTraitWeights, RankedCandidate, RecommendationBucket, TraitId } from "@/lib/search/v2/types";

const BUCKET_DEFS: Array<{
  id: string;
  label: string;
  trait_focus: TraitId | "overall" | "budget";
  pick: (items: RankedCandidate[]) => RankedCandidate | null;
}> = [
  {
    id: "overall",
    label: "Best Overall",
    trait_focus: "overall",
    pick: (items) =>
      [...items].sort(
        (a, b) => (b.goal_fit ?? b.final_score) - (a.goal_fit ?? a.final_score) || b.final_score - a.final_score,
      )[0] ?? null,
  },
  {
    id: "hydration",
    label: "Best Hydration",
    trait_focus: "hydration",
    pick: (items) =>
      [...items].sort((a, b) => (b.row.traits.hydration ?? 0) - (a.row.traits.hydration ?? 0))[0] ?? null,
  },
  {
    id: "endurance",
    label: "Best Endurance",
    trait_focus: "slow_energy",
    pick: (items) =>
      [...items].sort(
        (a, b) =>
          (b.row.traits.slow_energy ?? 0) +
          (b.row.traits.electrolytes ?? 0) -
          ((a.row.traits.slow_energy ?? 0) + (a.row.traits.electrolytes ?? 0)),
      )[0] ?? null,
  },
  {
    id: "recovery",
    label: "Best Recovery",
    trait_focus: "protein_density",
    pick: (items) =>
      [...items].sort(
        (a, b) =>
          (b.row.traits.protein_density ?? 0) +
          (b.row.traits.electrolytes ?? 0) -
          ((a.row.traits.protein_density ?? 0) + (a.row.traits.electrolytes ?? 0)),
      )[0] ?? null,
  },
  {
    id: "protein",
    label: "Best Protein",
    trait_focus: "protein_density",
    pick: (items) =>
      [...items].sort((a, b) => (b.row.traits.protein_density ?? 0) - (a.row.traits.protein_density ?? 0))[0] ??
      null,
  },
  {
    id: "clean",
    label: "Cleanest Label",
    trait_focus: "clean_label",
    pick: (items) =>
      [...items].sort((a, b) => (b.row.traits.clean_label ?? 0) - (a.row.traits.clean_label ?? 0))[0] ?? null,
  },
  {
    id: "budget",
    label: "Best Budget",
    trait_focus: "budget",
    pick: (items) => {
      const priced = items.filter((i) => i.row.price_inr != null && i.row.price_inr > 0);
      return (
        [...priced].sort((a, b) => {
          const aVal = (a.goal_fit ?? a.final_score) / (a.row.price_inr ?? 1);
          const bVal = (b.goal_fit ?? b.final_score) / (b.row.price_inr ?? 1);
          return bVal - aVal;
        })[0] ?? null
      );
    },
  },
  {
    id: "diabetic",
    label: "Best for Diabetics",
    trait_focus: "diabetic_friendly",
    pick: (items) =>
      [...items].sort(
        (a, b) => (b.row.traits.diabetic_friendly ?? 0) - (a.row.traits.diabetic_friendly ?? 0),
      )[0] ?? null,
  },
];

function dominantTraits(weights: GoalTraitWeights): TraitId[] {
  return (Object.entries(weights) as Array<[TraitId, number]>)
    .filter(([, w]) => w >= 0.15)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
}

export function buildGoalBuckets(
  ranked: RankedCandidate[],
  goalWeights: GoalTraitWeights | null,
  maxBuckets = 5,
): RecommendationBucket[] | null {
  if (!goalWeights || ranked.length < 2) return null;

  const dominant = dominantTraits(goalWeights);
  const bucketIds = new Set<string>(["overall", "budget"]);

  if (dominant.includes("hydration") || dominant.includes("electrolytes")) {
    bucketIds.add("hydration");
    bucketIds.add("endurance");
  }
  if (dominant.includes("protein_density")) bucketIds.add("protein");
  if (dominant.includes("clean_label") || dominant.includes("whole_food")) bucketIds.add("clean");
  if (dominant.includes("low_sugar") || dominant.includes("diabetic_friendly")) bucketIds.add("diabetic");
  if (dominant.includes("protein_density") && dominant.includes("electrolytes")) bucketIds.add("recovery");

  const usedProducts = new Set<string>();
  const buckets: RecommendationBucket[] = [];

  for (const def of BUCKET_DEFS) {
    if (!bucketIds.has(def.id)) continue;
    const pick = def.pick(ranked.filter((r) => !usedProducts.has(r.row.product_id)));
    if (!pick) continue;
    usedProducts.add(pick.row.product_id);
    buckets.push({
      id: def.id,
      label: def.label,
      trait_focus: def.trait_focus,
      items: [pick],
    });
    if (buckets.length >= maxBuckets) break;
  }

  return buckets.length >= 2 ? buckets : null;
}

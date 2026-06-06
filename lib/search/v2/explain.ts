import type { GoalTraitWeights, ProductSearchIndexRow, RankedCandidate, TraitId } from "@/lib/search/v2/types";
import { effectiveTraitScore } from "@/lib/search/v2/traits";
import { computeGoalFit } from "@/lib/search/v2/goal-graph";

const TRAIT_LABELS: Record<TraitId, string> = {
  protein_density: "High protein density",
  fiber_density: "Good fiber content",
  low_sugar: "Low sugar",
  low_sodium: "Low sodium",
  low_fat: "Low fat",
  low_saturated_fat: "Low saturated fat",
  healthy_fats: "Healthy fats",
  low_calorie_density: "Low calorie density",
  whole_food: "Whole-food profile",
  hydration: "Hydration support",
  electrolytes: "Natural electrolytes",
  satiety: "Keeps you full",
  gut_health: "Gut-friendly",
  slow_energy: "Slow-release energy",
  quick_energy: "Quick energy",
  antioxidant: "Antioxidant-rich",
  calcium_rich: "Calcium-rich",
  processing_level: "Minimally processed",
  clean_label: "Clean label",
  no_added_sugar: "No added sugar",
  kid_friendly: "Kid-friendly",
  diabetic_friendly: "Diabetes-friendly profile",
  gym_friendly: "Gym-friendly protein",
  elderly_friendly: "Gentle nutrition profile",
};

const MIN_TRAIT_CONF = 0.35;

export function buildTraitReasons(
  row: ProductSearchIndexRow,
  goalWeights?: GoalTraitWeights | null,
): Array<{ trait: TraitId; label: string }> {
  const out: Array<{ trait: TraitId; label: string }> = [];

  if (goalWeights) {
    const { contributions } = computeGoalFit(row, goalWeights);
    for (const c of contributions.sort((a, b) => b.effective * b.weight - a.effective * a.weight).slice(0, 4)) {
      if (c.effective < MIN_TRAIT_CONF) continue;
      out.push({ trait: c.trait, label: TRAIT_LABELS[c.trait] ?? c.trait });
    }
    return out;
  }

  for (const [trait, value] of Object.entries(row.traits) as Array<[TraitId, number]>) {
    const effective = effectiveTraitScore(trait, value, row);
    if (effective < 0.55) continue;
    out.push({ trait, label: TRAIT_LABELS[trait] ?? trait });
    if (out.length >= 4) break;
  }
  return out;
}

export function buildReasons(
  row: ProductSearchIndexRow,
  relevance: number,
  goalWeights?: GoalTraitWeights | null,
): string[] {
  const reasons: string[] = [];
  const traits = buildTraitReasons(row, goalWeights);
  for (const t of traits.slice(0, 3)) {
    reasons.push(t.label);
  }
  if (row.scout_score != null && row.scout_score >= 65) {
    reasons.push(`Scout score ${Math.round(row.scout_score)}/100`);
  }
  if (relevance >= 0.7 && row.primary_type) {
    reasons.push(`Matches ${row.primary_type}`);
  }
  if (row.data_quality_score < 0.5) {
    reasons.push("Label data partially verified");
  }
  return reasons.slice(0, 4);
}

export function attachExplainability(
  candidates: RankedCandidate[],
  goalWeights?: GoalTraitWeights | null,
): RankedCandidate[] {
  return candidates.map((c) => ({
    ...c,
    trait_reasons: buildTraitReasons(c.row, goalWeights),
    reasons: c.reasons.length ? c.reasons : buildReasons(c.row, c.relevance_score, goalWeights),
  }));
}

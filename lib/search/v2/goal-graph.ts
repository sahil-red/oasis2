import type {
  GoalTraitMapRow,
  GoalTraitWeights,
  ProductSearchIndexRow,
  TraitId,
} from "@/lib/search/v2/types";
import { effectiveTraitScore } from "@/lib/search/v2/traits";

/** Seed goals — mirrors migration 0013_search_v2.sql */
export const SEED_GOAL_TRAIT_MAP: GoalTraitMapRow[] = [
  {
    goal_id: "running",
    display_name: "Running / endurance",
    trait_weights: {
      hydration: 0.35,
      electrolytes: 0.3,
      slow_energy: 0.15,
      low_sugar: 0.1,
      whole_food: 0.1,
    },
    source: "seed",
    confidence: 1,
  },
  {
    goal_id: "pcos",
    display_name: "PCOS-friendly",
    trait_weights: {
      fiber_density: 0.3,
      low_sugar: 0.3,
      whole_food: 0.2,
      low_calorie_density: 0.1,
      clean_label: 0.1,
    },
    source: "seed",
    confidence: 1,
  },
  {
    goal_id: "diabetes",
    display_name: "Diabetes-friendly",
    trait_weights: {
      fiber_density: 0.3,
      low_sugar: 0.3,
      satiety: 0.2,
      whole_food: 0.1,
      low_sodium: 0.1,
    },
    source: "seed",
    confidence: 1,
  },
  {
    goal_id: "muscle_gain",
    display_name: "Muscle gain / bulking",
    trait_weights: {
      protein_density: 0.45,
      slow_energy: 0.2,
      whole_food: 0.15,
      clean_label: 0.1,
      satiety: 0.1,
    },
    source: "seed",
    confidence: 1,
  },
  {
    goal_id: "kids_tiffin",
    display_name: "Kids tiffin",
    trait_weights: {
      kid_friendly: 0.3,
      clean_label: 0.25,
      low_sugar: 0.2,
      calcium_rich: 0.15,
      whole_food: 0.1,
    },
    source: "seed",
    confidence: 1,
  },
  {
    goal_id: "weight_loss",
    display_name: "Weight loss",
    trait_weights: {
      low_calorie_density: 0.3,
      low_sugar: 0.25,
      fiber_density: 0.2,
      satiety: 0.15,
      clean_label: 0.1,
    },
    source: "seed",
    confidence: 1,
  },
  {
    goal_id: "gym",
    display_name: "Gym / fitness",
    trait_weights: {
      protein_density: 0.4,
      clean_label: 0.2,
      low_sugar: 0.15,
      whole_food: 0.15,
      satiety: 0.1,
    },
    source: "seed",
    confidence: 1,
  },
];

/** Bootstrap detect — only seeded goal_trait_map ids (§3b). Novel goals → LLM decomposition (§9). */
const GOAL_DETECT: Array<{ goal_id: string; re: RegExp; priority: number }> = [
  { goal_id: "running", re: /\b(running|runner|marathon|endurance|jogging|cardio)\b/i, priority: 90 },
  { goal_id: "pcos", re: /\bpcos\b/i, priority: 95 },
  { goal_id: "diabetes", re: /\b(diabetic|diabetes)\b/i, priority: 95 },
  { goal_id: "muscle_gain", re: /\b(muscle gain|bulking|mass gain|bodybuilding)\b/i, priority: 85 },
  { goal_id: "kids_tiffin", re: /\b(kids? tiffin|school lunch|tiffin|not junk|isn't junk)\b/i, priority: 88 },
  { goal_id: "weight_loss", re: /\b(weight loss|fat loss|slimming|lose weight)\b/i, priority: 87 },
  { goal_id: "gym", re: /\b(gym|workout|pre[\s-]?workout|post[\s-]?workout|fitness)\b/i, priority: 80 },
];

export function detectGoalId(query: string): string | null {
  const matches = GOAL_DETECT.filter((g) => g.re.test(query)).sort((a, b) => b.priority - a.priority);
  return matches[0]?.goal_id ?? null;
}

export function resolveGoalWeights(
  goalId: string | null,
  customMap?: Map<string, GoalTraitMapRow>,
): GoalTraitWeights | null {
  if (!goalId) return null;
  const fromDb = customMap?.get(goalId);
  if (fromDb) return fromDb.trait_weights;
  const seed = SEED_GOAL_TRAIT_MAP.find((g) => g.goal_id === goalId);
  return seed?.trait_weights ?? null;
}

export function computeGoalFit(
  row: ProductSearchIndexRow,
  weights: GoalTraitWeights,
): { score: number; contributions: Array<{ trait: TraitId; weight: number; effective: number }> } {
  let sumW = 0;
  let sum = 0;
  const contributions: Array<{ trait: TraitId; weight: number; effective: number }> = [];

  for (const [trait, weight] of Object.entries(weights) as Array<[TraitId, number]>) {
    if (!weight || weight <= 0) continue;
    const raw = row.traits[trait];
    if (raw == null) continue;
    const effective = effectiveTraitScore(trait, raw, row);
    if (effective <= 0) continue;
    sumW += weight;
    sum += weight * effective;
    contributions.push({ trait, weight, effective });
  }

  return {
    score: sumW > 0 ? sum / sumW : 0,
    contributions,
  };
}

export function goalDisplayName(goalId: string, customMap?: Map<string, GoalTraitMapRow>): string {
  return customMap?.get(goalId)?.display_name ?? SEED_GOAL_TRAIT_MAP.find((g) => g.goal_id === goalId)?.display_name ?? goalId;
}

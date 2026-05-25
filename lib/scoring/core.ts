import type { ProductNutrition } from "@/lib/supabase/types";
import {
  bandFromScore,
  gradeFromScore,
  HAZARDOUS_HARD_CAP,
  type Grade,
  type ScoreBand,
} from "@/lib/utils";
import { scoreIngredientSignals } from "./ingredient-signals";
import { scoreNutrition } from "./baselines";
import { scoreAdditives, type MatchedAdditive } from "./rules";

export interface CoreSubscores {
  nutrition: number;
  additives: number;
  labels: number;
}

export interface CoreScoreResult {
  score: number;
  grade: Grade;
  band: ScoreBand;
  subscores: CoreSubscores;
  concerns: Array<{ type: string; message: string; severity: string }>;
  breakdown: {
    additive_matches: MatchedAdditive[];
    nutrition_source?: string;
  };
}

function scoreLabels(
  ingredientsRaw: string | null,
  attributes: Record<string, string> | null,
): number {
  let score = 0;
  const text = [
    ingredientsRaw ?? "",
    attributes?.["Diet Preference"] ?? "",
    attributes?.["Key Features"] ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (/organic|jaivik|fssai organic/i.test(text)) score += 4;
  if (/no palm oil|palm oil free/i.test(text)) score += 2;
  if (/no added sugar|unsweetened|zero sugar/i.test(text)) score += 2;
  if (/no preserv|preservative[- ]?free|without preserv/i.test(text)) score += 2;
  if (/jaggery|gud\b|raw honey|multigrain|whole wheat|whole grain/i.test(text)) score += 2;

  return Math.min(10, score);
}

export function computeCoreScore(input: {
  ingredients_raw: string | null;
  nutrition: ProductNutrition | Record<string, unknown> | null;
  category: string | null;
  subcategory: string | null;
  product_name?: string | null;
  attributes?: Record<string, string> | null;
}): CoreScoreResult {
  const nutrition = (input.nutrition ?? null) as ProductNutrition | null;
  const additives = scoreAdditives(input.ingredients_raw);
  const signals = scoreIngredientSignals(
    input.ingredients_raw,
    input.attributes ?? null,
  );
  let nutritionScore = scoreNutrition(
    nutrition,
    input.category,
    input.subcategory,
    input.product_name,
  );
  nutritionScore = Math.max(0, Math.min(60, nutritionScore + signals.nutritionDelta));
  const labelsScore = Math.min(
    10,
    scoreLabels(input.ingredients_raw, input.attributes ?? null) + signals.labelsDelta,
  );

  let total = nutritionScore + additives.score + labelsScore;
  if (additives.hazardous) total = Math.min(total, HAZARDOUS_HARD_CAP);
  total = Math.max(0, Math.min(100, Math.round(total)));

  const concerns = additives.matches.map((m) => ({
    type: "additive",
    message: m.name,
    severity: m.tier,
  }));

  return {
    score: total,
    grade: gradeFromScore(total),
    band: bandFromScore(total),
    subscores: {
      nutrition: nutritionScore,
      additives: additives.score,
      labels: labelsScore,
    },
    concerns,
    breakdown: {
      additive_matches: additives.matches,
      nutrition_source:
        typeof nutrition?.source === "string" ? nutrition.source : undefined,
    },
  };
}

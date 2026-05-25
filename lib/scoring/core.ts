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

function isWholeFoodCategory(category: string | null): boolean {
  if (!category) return false;
  return /\b(Fresh Fruits|Fresh Vegetables|Fruits\s*&\s*Vegetables|Vegetables|Chicken, Meat & Fish|Eggs|Paneer)\b/i.test(
    category,
  );
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

  // Penalise unknown ingredient lists — full 30/30 additives only when we
  // can actually read the label. Whole-food categories (fresh produce,
  // meat, eggs) genuinely have no ingredient list and keep the benefit.
  const hasIngredientText =
    ((input.ingredients_raw ?? "").trim().length > 0) ||
    ((input.attributes?.["Ingredients"] ?? "").trim().length > 0);
  let additiveScore = additives.score;
  if (!hasIngredientText && !isWholeFoodCategory(input.category)) {
    additiveScore = Math.min(additiveScore, 20);
  }

  let total = nutritionScore + additiveScore + labelsScore;
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
      additives: additiveScore,
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

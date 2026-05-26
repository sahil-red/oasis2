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

function isKidsRelevantProduct(
  category: string | null,
  subcategory: string | null,
  productName: string | null | undefined,
): boolean {
  const hay = `${category ?? ""} ${subcategory ?? ""} ${productName ?? ""}`.toLowerCase();
  return (
    /\bbaby\b|\btoddler\b|\binfant\b|\bkids?\b/i.test(hay) ||
    /baby\s*&\s*toddler/i.test(category ?? "")
  );
}

function labelSugarG(nutrition: ProductNutrition | null): number | null {
  const s = nutrition?.sugar_g_100g ?? nutrition?.added_sugar_g_100g;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

function scoreLabels(
  ingredientsRaw: string | null,
  attributes: Record<string, string> | null,
  nutrition: ProductNutrition | null,
  category: string | null,
  subcategory: string | null,
  productName: string | null | undefined,
): number {
  let score = 0;
  const text = [
    ingredientsRaw ?? "",
    attributes?.["Diet Preference"] ?? "",
    attributes?.["Key Features"] ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const sugar = labelSugarG(nutrition);
  const kids = isKidsRelevantProduct(category, subcategory, productName);
  const claimsNoAddedSugar = /no added sugar|no hidden sugar|unsweetened|zero sugar/i.test(text);

  if (/organic|jaivik|fssai organic/i.test(text)) score += 4;
  if (/no palm oil|palm oil free/i.test(text)) score += 2;
  if (claimsNoAddedSugar && (sugar ?? 0) < 8) score += 2;
  if (/no preserv|preservative[- ]?free|without preserv/i.test(text)) score += 2;
  if (/jaggery|gud\b|raw honey|multigrain|whole wheat|whole grain/i.test(text)) score += 2;

  // Marketing claims that contradict the nutrition panel.
  if (claimsNoAddedSugar && (sugar ?? 0) >= 8) score -= 4;
  if (/\bdates?\b|\bdate powder\b/i.test(text) && kids && (sugar ?? 0) >= 8) score -= 2;

  if (kids && sugar != null) {
    if (sugar >= 12) score = Math.min(score, 2);
    else if (sugar >= 8) score = Math.min(score, 4);
  }

  return Math.max(0, Math.min(10, score));
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
  let labelsScore = Math.min(
    10,
    scoreLabels(
      input.ingredients_raw,
      input.attributes ?? null,
      nutrition,
      input.category,
      input.subcategory,
      input.product_name,
    ) + signals.labelsDelta,
  );

  const sugar = labelSugarG(nutrition);
  if (
    isKidsRelevantProduct(input.category, input.subcategory, input.product_name) &&
    sugar != null &&
    sugar >= 8
  ) {
    labelsScore = Math.min(labelsScore, sugar >= 12 ? 2 : 4);
  }

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

  if (
    isKidsRelevantProduct(input.category, input.subcategory, input.product_name) &&
    sugar != null
  ) {
    if (sugar >= 12) total = Math.min(total, 58);
    else if (sugar >= 8) total = Math.min(total, 68);
  }

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

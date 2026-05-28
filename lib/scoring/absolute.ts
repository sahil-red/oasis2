import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";
import { scoreIngredientQuality } from "@/lib/scoring/ingredient-quality";
import { detectLabelMismatch, scoreLabels } from "@/lib/scoring/labels-score";
import { scoreNutritionPerServe } from "@/lib/scoring/nutrition-per-serve";
import { inferRoleCohort, type RoleCohort } from "@/lib/scoring/role-cohort";
import {
  attachPerServeNutrition,
  type PerServeNutrition,
} from "@/lib/scoring/serving";
import type { MatchedAdditive } from "@/lib/scoring/rules";
import type { ProductNutrition } from "@/lib/supabase/types";
import { HAZARDOUS_HARD_CAP } from "@/lib/utils";

export type AbsoluteSubscores = {
  nutrition: number;
  ingredient: number;
  labels: number;
};

export type AbsoluteScoreResult = {
  absolute: number;
  subscores: AbsoluteSubscores;
  hazardous: boolean;
  label_mismatch: boolean;
  perServe: PerServeNutrition | null;
  role_cohort: RoleCohort;
  serving_g_effective: number | null;
  ingredient_source: "intelligence" | "rules_fallback";
  additive_matches: MatchedAdditive[];
};

const ROLE_ABSOLUTE_CAP: Partial<Record<RoleCohort, number>> = {
  treat: 70,
  adjunct: 75,
};

function isWholeFoodCategory(category: string | null): boolean {
  if (!category) return false;
  return /\b(Fresh Fruits|Fresh Vegetables|Fruits\s*&\s*Vegetables|Vegetables|Chicken, Meat & Fish|Eggs|Paneer)\b/i.test(
    category,
  );
}

function applyRoleCap(absolute: number, role: RoleCohort): number {
  const cap = ROLE_ABSOLUTE_CAP[role];
  return cap != null ? Math.min(absolute, cap) : absolute;
}

export function computeAbsoluteScore(input: {
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  category: string | null;
  subcategory: string | null;
  product_name?: string | null;
  attributes?: Record<string, string> | null;
  ingredientRows?: IngredientIntelligenceRow[];
  perServe?: PerServeNutrition | null;
}): AbsoluteScoreResult {
  const role_cohort = inferRoleCohort({
    name: input.product_name,
    category: input.category,
    subcategory: input.subcategory,
  });

  const { nutrition: nutritionWithServe, perServe: attached } =
    input.perServe != null
      ? { nutrition: input.nutrition, perServe: input.perServe }
      : attachPerServeNutrition(input.nutrition, {
          attributes: input.attributes ?? null,
          name: input.product_name,
          category: input.category,
          subcategory: input.subcategory,
        });

  const perServe = input.perServe ?? attached;
  const nutrition = nutritionWithServe ?? input.nutrition;

  const syntheticForLabels = perServe
    ? {
        sugar_g_100g:
          perServe.sugar_g != null && perServe.serving_g > 0
            ? (perServe.sugar_g * 100) / perServe.serving_g
            : nutrition?.sugar_g_100g,
        added_sugar_g_100g: nutrition?.added_sugar_g_100g,
      }
    : nutrition;

  let nutritionScore = scoreNutritionPerServe(
    perServe,
    input.category,
    input.subcategory,
    input.product_name,
    nutrition,
  );

  const ing = scoreIngredientQuality(
    input.ingredients_raw,
    input.ingredientRows ?? [],
  );

  const hasIngredientText =
    (input.ingredients_raw ?? "").trim().length > 0 ||
    ((input.attributes?.["Ingredients"] ?? "").trim().length > 0);

  let ingredientScore = ing.score;
  if (!hasIngredientText && !isWholeFoodCategory(input.category)) {
    ingredientScore = Math.min(ingredientScore, 20);
  }

  const label_mismatch = detectLabelMismatch(
    input.ingredients_raw,
    input.attributes ?? null,
    (syntheticForLabels as ProductNutrition) ?? nutrition,
  );

  let labelsScore = scoreLabels(
    input.ingredients_raw,
    input.attributes ?? null,
    (syntheticForLabels as ProductNutrition) ?? nutrition,
    input.category,
    input.subcategory,
    input.product_name,
  );
  if (label_mismatch) labelsScore = Math.max(0, labelsScore - 2);

  let total = nutritionScore + ingredientScore + labelsScore;
  if (ing.hazardous) total = Math.min(total, HAZARDOUS_HARD_CAP);

  total = applyRoleCap(total, role_cohort);
  total = Math.max(0, Math.min(100, Math.round(total)));

  return {
    absolute: total,
    subscores: {
      nutrition: nutritionScore,
      ingredient: ingredientScore,
      labels: labelsScore,
    },
    hazardous: ing.hazardous,
    label_mismatch,
    perServe,
    role_cohort,
    serving_g_effective: perServe?.serving_g ?? null,
    ingredient_source: ing.source,
    additive_matches: ing.matches,
  };
}

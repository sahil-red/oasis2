import { scoreNutrition } from "@/lib/scoring/baselines";
import type { PerServeNutrition } from "@/lib/scoring/serving";
import type { ProductNutrition } from "@/lib/supabase/types";

/** Map per-serve values to synthetic per-100g for baseline scoring (intake-weighted). */
export function syntheticNutritionFromPerServe(
  perServe: PerServeNutrition,
): ProductNutrition {
  const g = perServe.serving_g;
  const scale = g > 0 ? 100 / g : 1;
  const to100 = (v: number | undefined) =>
    v != null && Number.isFinite(v) ? v * scale : undefined;

  return {
    energy_kcal_100g: to100(perServe.energy_kcal),
    protein_g_100g: to100(perServe.protein_g),
    fat_g_100g: to100(perServe.fat_g),
    saturated_fat_g_100g: to100(perServe.saturated_fat_g),
    trans_fat_g_100g: to100(perServe.trans_fat_g),
    carbs_g_100g: to100(perServe.carbs_g),
    sugar_g_100g: to100(perServe.sugar_g),
    added_sugar_g_100g: to100(perServe.added_sugar_g),
    fiber_g_100g: to100(perServe.fiber_g),
    sodium_mg_100g: to100(perServe.sodium_mg),
    calcium_mg_100g: to100(perServe.calcium_mg),
    extra: {
      serving_size_g: g,
      per_serve_basis: "v9_synthetic_100g",
    },
  };
}

/** Nutrition subscore (0–60) using realistic serving, not raw per-100g panel. */
export function scoreNutritionPerServe(
  perServe: PerServeNutrition | null,
  category: string | null,
  subcategory: string | null,
  productName?: string | null,
  fallbackNutrition?: ProductNutrition | null,
): number {
  if (perServe?.serving_g) {
    const synthetic = syntheticNutritionFromPerServe(perServe);
    return scoreNutrition(synthetic, category, subcategory, productName);
  }
  return scoreNutrition(fallbackNutrition ?? null, category, subcategory, productName);
}

import type { ProductNutrition } from "@/lib/supabase/types";

const META = new Set(["source", "extra"]);

/** Canonical per-100g fields used for scoring and goal fit. */
export const CORE_NUTRITION_KEYS = [
  "energy_kcal_100g",
  "protein_g_100g",
  "fat_g_100g",
  "carbs_g_100g",
  "sugar_g_100g",
  "fiber_g_100g",
  "sodium_mg_100g",
] as const;

export function countNutritionFields(
  nutrition: ProductNutrition | Record<string, unknown> | null,
): number {
  if (!nutrition || typeof nutrition !== "object") return 0;
  let n = 0;
  for (const [k, v] of Object.entries(nutrition)) {
    if (META.has(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) n++;
  }
  return n;
}

/** True when we have a nutrition object but too little for reliable scoring. */
export function nutritionIsSparse(
  nutrition: ProductNutrition | Record<string, unknown> | null,
): boolean {
  if (!nutrition || typeof nutrition !== "object") return true;
  const n = nutrition as ProductNutrition;
  const fields = countNutritionFields(n);
  if (fields === 0) return true;
  const hasEnergy = typeof n.energy_kcal_100g === "number";
  const hasProtein = typeof n.protein_g_100g === "number";
  const hasCarbs = typeof n.carbs_g_100g === "number";
  // Single stray field (e.g. fibre only) from a partial platform row.
  if (fields < 3) return true;
  if (!hasEnergy && !hasProtein && !hasCarbs) return true;
  return false;
}

export function hasIngredients(ingredients_raw: string | null | undefined): boolean {
  return Boolean(ingredients_raw?.trim());
}

/** Blinkit PDP is good enough — skip label OCR. */
export function isPlatformNutritionComplete(
  ingredients_raw: string | null,
  nutrition: ProductNutrition | Record<string, unknown> | null,
): boolean {
  if (!hasIngredients(ingredients_raw)) return false;
  return !nutritionIsSparse(nutrition);
}

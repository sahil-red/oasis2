import type { ProductNutrition } from "@/lib/supabase/types";

const META = new Set(["source", "extra"]);
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

/** Zepto often sends a marketing tagline (e.g. "Real Fruits") instead of a label list. */
export function isPlausibleIngredientsList(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const s = raw.trim();
  if (s.length < 25) return false;
  if (/,|;|\(|\)|\d+\s*%/.test(s)) return true;
  return s.split(/\s+/).length >= 6;
}

export function hasIngredients(ingredients_raw: string | null | undefined): boolean {
  return isPlausibleIngredientsList(ingredients_raw);
}

/** Nutrition seeded from IFCT/USDA reference tables (fresh produce, staples). */
export function hasReferenceNutrition(
  nutrition: ProductNutrition | Record<string, unknown> | null,
): boolean {
  if (!nutrition || typeof nutrition !== "object") return false;
  const extra = (nutrition as ProductNutrition).extra;
  if (!extra || typeof extra !== "object") return false;
  const row = extra as Record<string, unknown>;
  return typeof row.reference_id === "string" || row.reference === "ifct_2017";
}

/** True when platform nutrition exists but key label fields are missing (e.g. sugar on desserts). */
export function nutritionHasCriticalGaps(
  nutrition: ProductNutrition | Record<string, unknown> | null,
): boolean {
  if (!nutrition || typeof nutrition !== "object") return true;
  if (nutritionIsSparse(nutrition)) return true;

  const n = nutrition as ProductNutrition;
  const hasCarbs = typeof n.carbs_g_100g === "number" && n.carbs_g_100g > 5;
  const hasEnergy = typeof n.energy_kcal_100g === "number" && n.energy_kcal_100g > 50;
  const hasSugar =
    (typeof n.sugar_g_100g === "number" && Number.isFinite(n.sugar_g_100g)) ||
    (typeof n.added_sugar_g_100g === "number" && Number.isFinite(n.added_sugar_g_100g));

  // Zepto often omits sugar even when the back-label image has it.
  if ((hasCarbs || hasEnergy) && !hasSugar) return true;

  return false;
}

/** Blinkit/Zepto PDP is good enough — skip label OCR. */
export function isPlatformNutritionComplete(
  ingredients_raw: string | null,
  nutrition: ProductNutrition | Record<string, unknown> | null,
): boolean {
  if (!hasIngredients(ingredients_raw)) return false;
  return !nutritionHasCriticalGaps(nutrition);
}

/** Product still needs a label scan (missing ingredients and/or nutrition gaps). */
export function needsLabelOcr(
  ingredients_raw: string | null,
  nutrition: ProductNutrition | Record<string, unknown> | null,
): boolean {
  return !isPlatformNutritionComplete(ingredients_raw, nutrition);
}

/** Fresh whole produce uses reference nutrition — no packaging label to OCR. */
export function isReferenceProduceNutritionComplete(
  nutrition: ProductNutrition | Record<string, unknown> | null,
): boolean {
  return hasReferenceNutrition(nutrition) && !nutritionIsSparse(nutrition);
}

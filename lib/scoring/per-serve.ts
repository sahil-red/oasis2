import type { ProductNutrition } from "@/lib/supabase/types";
import type { PerServeNutrition } from "@/lib/scoring/serving";

/** Read per-serve values from nutrition.extra (after backfill) or scale from per-100g. */
export function perServeFromNutrition(
  nutrition: ProductNutrition | null,
): PerServeNutrition | null {
  if (!nutrition?.extra) return null;
  const extra = nutrition.extra;
  const serving_g =
    typeof extra.serving_size_g === "number" ? extra.serving_size_g : null;
  if (serving_g == null || serving_g <= 0) return null;

  const num = (k: string) => {
    const v = extra[k];
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };

  return {
    serving_g,
    serving_source:
      (extra.serving_resolution as PerServeNutrition["serving_source"]) ??
      "label_extra",
    energy_kcal: num("per_serve_energy_kcal"),
    protein_g: num("per_serve_protein_g"),
    fat_g: num("per_serve_fat_g"),
    carbs_g: num("per_serve_carbs_g"),
    sugar_g: num("per_serve_sugar_g"),
    fiber_g: num("per_serve_fiber_g"),
    sodium_mg: num("per_serve_sodium_mg"),
    saturated_fat_g: num("per_serve_saturated_fat_g"),
    trans_fat_g: num("per_serve_trans_fat_g"),
    calcium_mg: num("per_serve_calcium_mg"),
  };
}

import { mergeNutrition } from "@/lib/grocery/parse-nutrition-block";
import { nutritionHasCriticalGaps } from "@/lib/nutrition/completeness";
import type { OcrNutrition } from "@/lib/ocr/types";
import type { ProductNutrition } from "@/lib/supabase/types";

export function ocrNutritionToProduct(n: OcrNutrition): ProductNutrition {
  const out: ProductNutrition = { source: "label" };
  if (n.energy_kcal != null) out.energy_kcal_100g = n.energy_kcal;
  if (n.protein_g != null) out.protein_g_100g = n.protein_g;
  if (n.fat_g != null) out.fat_g_100g = n.fat_g;
  if (n.saturated_fat_g != null) out.saturated_fat_g_100g = n.saturated_fat_g;
  if (n.trans_fat_g != null) out.trans_fat_g_100g = n.trans_fat_g;
  if (n.carbs_g != null) out.carbs_g_100g = n.carbs_g;
  if (n.sugar_g != null) out.sugar_g_100g = n.sugar_g;
  if (n.added_sugar_g != null) out.added_sugar_g_100g = n.added_sugar_g;
  if (n.fiber_g != null) out.fiber_g_100g = n.fiber_g;
  if (n.sodium_mg != null) out.sodium_mg_100g = n.sodium_mg;
  return out;
}

/** Fill gaps in platform nutrition from a label OCR read (never overwrites existing values). */
export function mergeOcrIntoProductNutrition(
  current: ProductNutrition | null,
  ocr: OcrNutrition | undefined,
): ProductNutrition | null {
  if (!ocr) return current;
  const fromOcr = ocrNutritionToProduct(ocr);
  if (!current) return { ...fromOcr, source: "label" };

  const merged = mergeNutrition(current, fromOcr);
  if (!merged || JSON.stringify(merged) === JSON.stringify(current)) return current;

  const hadGaps = nutritionHasCriticalGaps(current);
  return {
    ...merged,
    source: current.source === "platform" ? "platform" : "label",
    extra: {
      ...(merged.extra ?? {}),
      ...(hadGaps ? { ocr_filled_gaps: 1 } : {}),
    },
  };
}

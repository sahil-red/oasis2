import { mergeNutrition, parseServingNutritionBlock } from "@/lib/grocery/parse-nutrition-block";
import { nutritionHasCriticalAnomalies, sanitizeNutrition } from "@/lib/nutrition/anomaly";
import { nutritionIsSparse } from "@/lib/nutrition/completeness";
import type { ProductNutrition } from "@/lib/supabase/types";

/** Upper bounds for protein per 100g by product class (catch OCR / parser garbage). */
const PROTEIN_CEILING: Array<{ test: (name: string, cat: string) => boolean; max: number }> = [
  {
    test: (n, c) => /\b(whey|protein powder|isolate|mass gainer)\b/i.test(n + c),
    max: 90,
  },
  {
    test: (n, c) => /\b(high protein|protein atta|protein flour)\b/i.test(n + c),
    max: 55,
  },
  {
    test: (n, c) =>
      /\b(masala|spice|seasoning|hing|turmeric|chilli powder|tea)\b/i.test(n) ||
      /\bmasala|spice/i.test(c),
    max: 25,
  },
  { test: () => true, max: 40 },
];

export function maxProteinPer100g(name: string, category: string | null): number {
  const c = category ?? "";
  for (const row of PROTEIN_CEILING) {
    if (row.test(name, c)) return row.max;
  }
  return 40;
}

export function nutritionLooksImplausible(
  nutrition: ProductNutrition,
  name: string,
  category: string | null,
  subcategory?: string | null,
): boolean {
  return nutritionHasCriticalAnomalies(nutrition, { name, category, subcategory });
}

/** Prefer Blinkit "Nutrition Information" attribute when platform/OCR rows are wrong. */
export function nutritionFromAttributes(
  attributes: Record<string, string> | null | undefined,
): ProductNutrition | null {
  if (!attributes) return null;
  let block: string | null = null;
  for (const [k, v] of Object.entries(attributes)) {
    if (!/nutri/i.test(k) || !v?.trim()) continue;
    if (v.includes("\n") || /per\s*100/i.test(v) || /per\s*100/i.test(k)) {
      block = v.trim();
      break;
    }
  }
  block ??=
    attributes["Nutrition Information"]?.trim() ??
    attributes["Nutritional Information"]?.trim() ??
    null;
  if (!block) return null;
  return parseServingNutritionBlock(block);
}

export function reconcileNutrition(opts: {
  nutrition: ProductNutrition | null;
  attributes?: Record<string, string> | null;
  name: string;
  category: string | null;
  subcategory?: string | null;
  net_weight?: string | null;
}): ProductNutrition | null {
  const fromAttrs = nutritionFromAttributes(opts.attributes);
  const ctx = { name: opts.name, category: opts.category, subcategory: opts.subcategory };

  const current = opts.nutrition;
  if (!current && !fromAttrs) return null;

  let picked: ProductNutrition | null;

  if (!fromAttrs) {
    picked = current;
  } else if (!current) {
    picked = fromAttrs;
  } else if (nutritionIsSparse(current) && fromAttrs) {
    const merged = mergeNutrition(fromAttrs, current);
    picked =
      merged && !nutritionIsSparse(merged) ? { ...merged, source: "platform" } : fromAttrs;
  } else {
    const currentBad = nutritionHasCriticalAnomalies(current, ctx);
    const attrsBad = nutritionHasCriticalAnomalies(fromAttrs, ctx);
    const attrsPackMisscaled =
      !attrsBad &&
      !currentBad &&
      fromAttrs.energy_kcal_100g != null &&
      current.energy_kcal_100g != null &&
      fromAttrs.energy_kcal_100g < current.energy_kcal_100g * 0.55 &&
      fromAttrs.energy_kcal_100g < 90;

    if (currentBad && attrsBad) {
      picked = null;
    } else if (attrsPackMisscaled) {
      picked = current;
    } else if (currentBad && !attrsBad) {
      picked = { ...fromAttrs, source: "platform" };
    } else if (!currentBad && attrsBad) {
      picked = current;
    } else if (current.source === "ocr" && fromAttrs.protein_g_100g != null) {
      const p = current.protein_g_100g ?? 0;
      const ap = fromAttrs.protein_g_100g ?? 0;
      if (
        p > maxProteinPer100g(opts.name, opts.category) &&
        ap <= maxProteinPer100g(opts.name, opts.category)
      ) {
        picked = { ...current, ...fromAttrs, source: "platform" };
      } else {
        picked = current;
      }
    } else {
      picked = current;
    }
  }

  return sanitizeNutrition(picked, ctx);
}

import { detectNutritionAnomalies } from "@/lib/nutrition/anomaly";
import type { ProductNutrition } from "@/lib/supabase/types";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function computeDataQuality(opts: {
  nutrition: ProductNutrition | null;
  ingredients_raw: string | null;
  attributes: Record<string, string> | null;
  name: string;
  category: string | null;
  subcategory: string | null;
}): {
  data_quality_score: number;
  data_completeness: number;
  facet_confidence: Record<string, number>;
} {
  const facet_confidence: Record<string, number> = {};
  let completeness = 0;
  let maxCompleteness = 5;

  if (opts.ingredients_raw?.trim()) {
    completeness += 1;
    facet_confidence.ingredients = 0.85;
  }
  const n = opts.nutrition;
  if (n) {
    if (num(n.energy_kcal_100g) != null) completeness += 1;
    if (num(n.protein_g_100g) != null) completeness += 1;
    if (num(n.fat_g_100g) != null) completeness += 1;
    if (num(n.sugar_g_100g) != null || num(n.added_sugar_g_100g) != null) completeness += 1;
    facet_confidence.nutrition = 0.8;
  }

  const attrs = opts.attributes ?? {};
  const dsConf = attrs["DeepSeek Nutrition Confidence"] ?? attrs["DeepSeek Ingredients Confidence"];
  if (dsConf) {
    const parsed = Number.parseFloat(dsConf);
    if (Number.isFinite(parsed)) facet_confidence.ocr = Math.max(0, Math.min(1, parsed));
  }

  const data_completeness = completeness / maxCompleteness;

  let consistency = 1;
  if (n) {
    const anomalies = detectNutritionAnomalies(n, {
      name: opts.name,
      category: opts.category,
      subcategory: opts.subcategory,
    });
    const critical = anomalies.filter((a) => a.severity === "critical").length;
    const warning = anomalies.filter((a) => a.severity === "warning").length;
    consistency = Math.max(0, 1 - critical * 0.35 - warning * 0.1);
  }

  const ocrConf = facet_confidence.ocr ?? 0.65;
  const data_quality_score = Math.max(
    0,
    Math.min(1, data_completeness * 0.45 + consistency * 0.35 + ocrConf * 0.2),
  );

  return { data_quality_score, data_completeness, facet_confidence };
}

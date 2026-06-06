import { detectNutritionAnomalies } from "@/lib/nutrition/anomaly";
import type { ProductNutrition } from "@/lib/supabase/types";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** §5 pinned formula */
export function computeDataQuality(opts: {
  nutrition: ProductNutrition | null;
  ingredients_raw: string | null;
  attributes: Record<string, string> | null;
  name: string;
  category: string | null;
  subcategory: string | null;
  allergens?: string[] | null;
}): {
  data_quality_score: number;
  data_completeness: number;
  facet_confidence: Record<string, number>;
} {
  const fields = [
    Boolean(opts.name?.trim()),
    Boolean(opts.category?.trim()),
    Boolean(opts.nutrition),
    Boolean(opts.ingredients_raw?.trim()),
    Boolean(opts.allergens?.length),
  ];
  const completeness = fields.filter(Boolean).length / fields.length;

  const attrs = opts.attributes ?? {};
  const confidences: number[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (/deepseek.*confidence/i.test(k)) {
      const parsed = Number.parseFloat(v);
      if (Number.isFinite(parsed)) confidences.push(Math.max(0, Math.min(1, parsed)));
    }
  }
  const ocr_confidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.5;

  let consistency = 1;
  if (opts.nutrition) {
    const anomalies = detectNutritionAnomalies(opts.nutrition, {
      name: opts.name,
      category: opts.category,
      subcategory: opts.subcategory,
    });
    const critical = anomalies.filter((a) => a.severity === "critical").length;
    const warning = anomalies.filter((a) => a.severity === "warning").length;
    consistency = Math.max(0, 1 - critical * 0.35 - warning * 0.1);
  }

  const data_quality_score = Math.max(
    0,
    Math.min(1, completeness * 0.4 + ocr_confidence * 0.3 + consistency * 0.3),
  );

  return {
    data_quality_score,
    data_completeness: completeness,
    facet_confidence: { ocr: ocr_confidence, consistency },
  };
}

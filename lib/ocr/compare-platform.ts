import { CORE_NUTRITION_KEYS, countNutritionFields, hasIngredients } from "@/lib/nutrition/completeness";
import { ocrNutritionToProduct } from "@/lib/nutrition/from-ocr";
import type { OcrPayload } from "@/lib/ocr/types";
import type { ProductNutrition } from "@/lib/supabase/types";

export type FieldCompareStatus =
  | "match"
  | "different"
  | "ocr_adds"
  | "existing_only"
  | "both_missing";

export type OcrCompareSummary = {
  ingredients: FieldCompareStatus;
  nutrition: FieldCompareStatus;
  ingredients_detail?: {
    existing_len: number;
    ocr_ingredient_count: number;
    overlap_ratio?: number;
  };
  nutrition_detail?: {
    existing_fields: string[];
    ocr_fields: string[];
    matched_fields: string[];
    differing_fields: string[];
  };
};

const NUTRITION_TOLERANCE = 0.15;

function normalizeIngredientText(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9%,\s]/g, " ")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function ingredientsFromOcr(payload: OcrPayload): string {
  return payload.ingredients
    .map((i) => i.name.trim())
    .filter(Boolean)
    .join(", ");
}

function hasOcrIngredients(payload: OcrPayload | null): boolean {
  if (!payload?.ingredients?.length) return false;
  return ingredientsFromOcr(payload).length >= 15;
}

function hasOcrNutrition(payload: OcrPayload | null): boolean {
  if (!payload?.nutrition_per_100g) return false;
  return Object.keys(payload.nutrition_per_100g).length >= 2;
}

function tokenOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const hit = a.filter((t) => setB.has(t)).length;
  return hit / Math.max(a.length, b.length);
}

export function compareIngredients(
  existing: string | null,
  payload: OcrPayload | null,
): FieldCompareStatus {
  const exOk = hasIngredients(existing);
  const ocrOk = payload ? hasOcrIngredients(payload) : false;
  if (!exOk && !ocrOk) return "both_missing";
  if (exOk && !ocrOk) return "existing_only";
  if (!exOk && ocrOk) return "ocr_adds";
  const exTokens = normalizeIngredientText(existing!);
  const ocrTokens = normalizeIngredientText(ingredientsFromOcr(payload!));
  const overlap = tokenOverlap(exTokens, ocrTokens);
  if (overlap >= 0.45) return "match";
  return "different";
}

function nutritionFieldMap(n: ProductNutrition | null): Map<string, number> {
  const m = new Map<string, number>();
  if (!n) return m;
  for (const key of CORE_NUTRITION_KEYS) {
    const v = n[key as keyof ProductNutrition];
    if (typeof v === "number" && Number.isFinite(v)) m.set(key, v);
  }
  return m;
}

export function compareNutrition(
  existing: ProductNutrition | null,
  payload: OcrPayload | null,
): FieldCompareStatus {
  const exOk = countNutritionFields(existing) >= 2;
  const ocrN = payload?.nutrition_per_100g
    ? ocrNutritionToProduct(payload.nutrition_per_100g)
    : null;
  const ocrOk = countNutritionFields(ocrN) >= 2;
  if (!exOk && !ocrOk) return "both_missing";
  if (exOk && !ocrOk) return "existing_only";
  if (!exOk && ocrOk) return "ocr_adds";

  const exMap = nutritionFieldMap(existing);
  const ocrMap = nutritionFieldMap(ocrN);
  const shared: string[] = [];
  const matched: string[] = [];
  const differing: string[] = [];

  for (const [key, exVal] of exMap) {
    const ocrVal = ocrMap.get(key);
    if (ocrVal == null) continue;
    shared.push(key);
    const denom = Math.max(Math.abs(exVal), Math.abs(ocrVal), 1);
    if (Math.abs(exVal - ocrVal) / denom <= NUTRITION_TOLERANCE) matched.push(key);
    else differing.push(key);
  }

  if (!shared.length) {
    if (exOk && ocrOk) return "different";
    return exOk ? "existing_only" : "ocr_adds";
  }
  if (differing.length === 0) return "match";
  if (matched.length === 0) return "different";
  return "different";
}

export function buildOcrCompareSummary(
  existingIngredients: string | null,
  existingNutrition: ProductNutrition | null,
  payload: OcrPayload | null,
): OcrCompareSummary {
  const ingredients = compareIngredients(existingIngredients, payload);
  const nutrition = compareNutrition(existingNutrition, payload);
  const summary: OcrCompareSummary = { ingredients, nutrition };

  if (payload && hasIngredients(existingIngredients)) {
    const exTokens = normalizeIngredientText(existingIngredients!);
    const ocrTokens = normalizeIngredientText(ingredientsFromOcr(payload));
    summary.ingredients_detail = {
      existing_len: existingIngredients!.length,
      ocr_ingredient_count: payload.ingredients.length,
      overlap_ratio: tokenOverlap(exTokens, ocrTokens),
    };
  }

  const ocrN = payload?.nutrition_per_100g
    ? ocrNutritionToProduct(payload.nutrition_per_100g)
    : null;
  const exMap = nutritionFieldMap(existingNutrition);
  const ocrMap = nutritionFieldMap(ocrN);
  if (exMap.size || ocrMap.size) {
    const matched: string[] = [];
    const differing: string[] = [];
    for (const [key, exVal] of exMap) {
      const ocrVal = ocrMap.get(key);
      if (ocrVal == null) continue;
      const denom = Math.max(Math.abs(exVal), Math.abs(ocrVal), 1);
      if (Math.abs(exVal - ocrVal) / denom <= NUTRITION_TOLERANCE) matched.push(key);
      else differing.push(key);
    }
    summary.nutrition_detail = {
      existing_fields: [...exMap.keys()],
      ocr_fields: [...ocrMap.keys()],
      matched_fields: matched,
      differing_fields: differing,
    };
  }

  return summary;
}

export type CompareRollup = Record<FieldCompareStatus, number>;

export function emptyRollup(): CompareRollup {
  return {
    match: 0,
    different: 0,
    ocr_adds: 0,
    existing_only: 0,
    both_missing: 0,
  };
}

export function bumpRollup(rollup: CompareRollup, status: FieldCompareStatus): void {
  rollup[status] = (rollup[status] ?? 0) + 1;
}

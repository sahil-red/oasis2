import { parseServingNutritionBlock } from "@/lib/grocery/parse-nutrition-block";
import type { OcrNutrition, OcrPayload } from "./types";

export interface OcrTrustOptions {
  /** Minimum confidence.overall (default: 0.55). */
  minOverall?: number;
  /** Max allowed deviation between stated kcal and 4P+4C+9F (default 0.30). */
  macroSanityTolerance?: number;
}

export interface OcrTrustResult {
  trustworthy: boolean;
  reason: string;
  adjustedConfidence: number;
}

const CORE_MACRO_KEYS: Array<keyof OcrNutrition> = [
  "energy_kcal",
  "protein_g",
  "carbs_g",
  "fat_g",
];

function defaultMinOverall(_payload: OcrPayload): number {
  return 0.55;
}

function countCoreMacros(n?: OcrNutrition): number {
  if (!n) return 0;
  return CORE_MACRO_KEYS.filter((k) => typeof n[k] === "number" && Number.isFinite(n[k])).length;
}

function countIngredients(payload: OcrPayload): number {
  return payload.ingredients?.filter((i) => i.name?.trim().length > 1).length ?? 0;
}

function macroSanityCheck(
  n: OcrNutrition,
  tolerance: number,
): { ok: boolean; implied?: number; stated?: number } {
  const p = n.protein_g ?? 0;
  const c = n.carbs_g ?? 0;
  const f = n.fat_g ?? 0;
  const stated = n.energy_kcal;
  if (stated == null || !Number.isFinite(stated)) return { ok: true };
  if (p === 0 && c === 0 && f === 0) return { ok: true };
  const implied = 4 * p + 4 * c + 9 * f;
  if (implied <= 0) return { ok: true };
  const deviation = Math.abs(stated - implied) / Math.max(stated, implied);
  return { ok: deviation <= tolerance, implied, stated };
}

function crossValidateFromRawText(
  payload: OcrPayload,
): { boost: number; penalty: number; parsedMacros: number } {
  const raw = payload.raw_text?.trim();
  if (!raw) return { boost: 0, penalty: 0, parsedMacros: 0 };

  const parsed = parseServingNutritionBlock(raw);
  if (!parsed) return { boost: 0, penalty: 0, parsedMacros: 0 };

  const parsedMacros = countCoreMacros({
    energy_kcal: parsed.energy_kcal_100g,
    protein_g: parsed.protein_g_100g,
    carbs_g: parsed.carbs_g_100g,
    fat_g: parsed.fat_g_100g,
  });

  const ocr = payload.nutrition_per_100g;
  if (!ocr || parsedMacros < 3) {
    return { boost: parsedMacros >= 3 ? 0.05 : 0, penalty: 0, parsedMacros };
  }

  let agreements = 0;
  let disagreements = 0;
  const pairs: Array<[keyof OcrNutrition, number | undefined]> = [
    ["energy_kcal", parsed.energy_kcal_100g],
    ["protein_g", parsed.protein_g_100g],
    ["carbs_g", parsed.carbs_g_100g],
    ["fat_g", parsed.fat_g_100g],
  ];
  for (const [key, parsedVal] of pairs) {
    const ocrVal = ocr[key];
    if (parsedVal == null || ocrVal == null) continue;
    const rel = Math.abs(ocrVal - parsedVal) / Math.max(Math.abs(parsedVal), 1);
    if (rel <= 0.25) agreements++;
    else if (rel > 0.5) disagreements++;
  }

  const boost = agreements >= 2 ? 0.08 : agreements >= 1 ? 0.04 : 0;
  const penalty = disagreements >= 2 ? 0.12 : disagreements >= 1 ? 0.06 : 0;
  return { boost, penalty, parsedMacros };
}

/** Decide whether OCR output is trustworthy enough to persist on a product row. */
export function isOcrResultTrustworthy(
  payload: OcrPayload,
  opts: OcrTrustOptions = {},
): OcrTrustResult {
  const minOverall = opts.minOverall ?? defaultMinOverall(payload);
  const tolerance = opts.macroSanityTolerance ?? 0.3;

  let confidence = payload.confidence.overall;
  const ingredientCount = countIngredients(payload);
  const macroCount = countCoreMacros(payload.nutrition_per_100g);

  const hasNutritionTable =
    payload.confidence.has_nutrition_table && macroCount >= 3;
  const hasIngredients =
    payload.confidence.has_ingredients && ingredientCount >= 3;

  if (confidence < minOverall) {
    return {
      trustworthy: false,
      reason: `overall_confidence_${confidence.toFixed(2)}_below_${minOverall}`,
      adjustedConfidence: confidence,
    };
  }

  if (!hasNutritionTable && !hasIngredients) {
    return {
      trustworthy: false,
      reason: `insufficient_content_macros=${macroCount}_ingredients=${ingredientCount}`,
      adjustedConfidence: confidence,
    };
  }

  const cross = crossValidateFromRawText(payload);
  confidence = Math.min(1, Math.max(0, confidence + cross.boost - cross.penalty));

  if (payload.nutrition_per_100g) {
    const sanity = macroSanityCheck(payload.nutrition_per_100g, tolerance);
    if (!sanity.ok) {
      return {
        trustworthy: false,
        reason: `macro_sanity_fail stated=${sanity.stated} implied=${sanity.implied?.toFixed(0)}`,
        adjustedConfidence: confidence,
      };
    }
  }

  if (confidence < minOverall) {
    return {
      trustworthy: false,
      reason: `adjusted_confidence_${confidence.toFixed(2)}_below_${minOverall}`,
      adjustedConfidence: confidence,
    };
  }

  return {
    trustworthy: true,
    reason: hasNutritionTable && hasIngredients ? "nutrition_and_ingredients" : hasNutritionTable ? "nutrition_only" : "ingredients_only",
    adjustedConfidence: confidence,
  };
}

import {
  buildOcrCompareSummary,
  compareIngredients,
  compareNutrition,
  type FieldCompareStatus,
  type OcrCompareSummary,
} from "@/lib/ocr/compare-platform";
import { ocrNutritionToProduct } from "@/lib/nutrition/from-ocr";
import { resolveIngredientsText } from "@/lib/ocr/ingredients-quality";
import { mergeNutrition } from "@/lib/grocery/parse-nutrition-block";
import {
  countNutritionFields,
  hasIngredients,
} from "@/lib/nutrition/completeness";
import type { StructuredLabel } from "@/lib/ocr/lm-studio-structure";
import { parseLabelTextToPayload } from "@/lib/ocr/parse-label-text";
import {
  parseServingSizeGrams,
  scalePer100gToServe,
} from "@/lib/ocr/serving-size-grams";
import type { OcrNutrition, OcrPayload } from "@/lib/ocr/types";
import type { ProductNutrition } from "@/lib/supabase/types";

/** Where the canonical value shown on the site came from. */
export type LabelFieldSource = "csv" | "llm" | "ocr" | "missing";

export type LabelFieldResolution = {
  nutrition_source: LabelFieldSource;
  ingredients_source: LabelFieldSource;
  lm_called: boolean;
  lm_skip_reason?: string;
  compare: OcrCompareSummary;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  serving_size: string | null;
  regex_payload: OcrPayload;
};

function csvHasNutrition(n: ProductNutrition | null): boolean {
  return countNutritionFields(n) >= 2;
}

function fieldNeedsLm(
  status: FieldCompareStatus,
  hasRawText: boolean,
  csvPresent: boolean,
): boolean {
  if (status === "match" || status === "existing_only") return false;
  // LiveText regex already extracted OCR fields — LLM would only duplicate work.
  if (status === "ocr_adds") return false;
  if (!csvPresent) return hasRawText && status === "both_missing";
  if (status === "both_missing") return hasRawText;
  // Only pay for LM when CSV and OCR regex genuinely disagree.
  return status === "different";
}

function structuredToOcrNutrition(structured: StructuredLabel): OcrNutrition | null {
  const ocr: OcrNutrition = {
    energy_kcal: structured.calories_100g ?? undefined,
    protein_g: structured.protein_g_100g ?? undefined,
    carbs_g: structured.carbs_g_100g ?? undefined,
    fat_g: structured.fat_g_100g ?? undefined,
    fiber_g: structured.fiber_g_100g ?? undefined,
    sugar_g: structured.sugar_g_100g ?? undefined,
    sodium_mg: structured.sodium_mg_100g ?? undefined,
  };
  const keys = Object.keys(ocr).filter(
    (k) => ocr[k as keyof OcrNutrition] != null,
  );
  return keys.length >= 2 ? ocr : null;
}

/** Derive per-serving values in nutrition.extra from per-100g + serving_size. */
export function attachPerServeExtra(
  nutrition: ProductNutrition,
  structured: StructuredLabel,
): ProductNutrition {
  const serveG = parseServingSizeGrams(structured.serving_size);
  const extra: Record<string, number | string> = {
    ...(nutrition.extra ?? {}),
    label_basis: "per_100g",
  };
  if (structured.serving_size) extra.serving_size = structured.serving_size;
  if (serveG != null) extra.serving_size_g = serveG;

  if (serveG != null) {
    const perServeEnergy = scalePer100gToServe(structured.calories_100g, serveG);
    const perServeProtein = scalePer100gToServe(structured.protein_g_100g, serveG);
    const perServeCarbs = scalePer100gToServe(structured.carbs_g_100g, serveG);
    const perServeFat = scalePer100gToServe(structured.fat_g_100g, serveG);
    const perServeFiber = scalePer100gToServe(structured.fiber_g_100g, serveG);
    const perServeSugar = scalePer100gToServe(structured.sugar_g_100g, serveG);
    const perServeSodium = scalePer100gToServe(structured.sodium_mg_100g, serveG);

    if (perServeEnergy != null) extra.per_serve_energy_kcal = perServeEnergy;
    if (perServeProtein != null) extra.per_serve_protein_g = perServeProtein;
    if (perServeCarbs != null) extra.per_serve_carbs_g = perServeCarbs;
    if (perServeFat != null) extra.per_serve_fat_g = perServeFat;
    if (perServeFiber != null) extra.per_serve_fiber_g = perServeFiber;
    if (perServeSugar != null) extra.per_serve_sugar_g = perServeSugar;
    if (perServeSodium != null) extra.per_serve_sodium_mg = perServeSodium;
    extra.per_serve_basis = "computed";
  }

  return { ...nutrition, extra };
}

export function structuredToProductNutrition(
  structured: StructuredLabel,
): ProductNutrition | null {
  const ocr = structuredToOcrNutrition(structured);
  if (!ocr) return null;
  const product = ocrNutritionToProduct(ocr);
  product.source = "label";
  return attachPerServeExtra(product, structured);
}

export function regexPayloadFromRawText(rawText: string): OcrPayload {
  return parseLabelTextToPayload(rawText, {
    backend: "vision",
    backendNote: "livetext_regex",
    avgConfidence: 0.85,
    rawText,
  });
}

export function planLabelResolution(
  csvIngredients: string | null,
  csvNutrition: ProductNutrition | null,
  rawText: string,
): {
  compare: OcrCompareSummary;
  regex_payload: OcrPayload;
  needs_nutrition_lm: boolean;
  needs_ingredients_lm: boolean;
  lm_called: boolean;
} {
  const regex_payload = regexPayloadFromRawText(rawText);
  const compare = buildOcrCompareSummary(csvIngredients, csvNutrition, regex_payload);
  const hasRawText = Boolean(rawText?.trim());
  const needs_nutrition_lm = fieldNeedsLm(
    compare.nutrition,
    hasRawText,
    csvHasNutrition(csvNutrition),
  );
  const needs_ingredients_lm = fieldNeedsLm(
    compare.ingredients,
    hasRawText,
    hasIngredients(csvIngredients),
  );
  return {
    compare,
    regex_payload,
    needs_nutrition_lm,
    needs_ingredients_lm,
    lm_called: needs_nutrition_lm || needs_ingredients_lm,
  };
}

export function resolveLabelFields(input: {
  csvIngredients: string | null;
  csvNutrition: ProductNutrition | null;
  rawText: string;
  structured?: StructuredLabel | null;
  productName?: string | null;
}): LabelFieldResolution {
  const plan = planLabelResolution(
    input.csvIngredients,
    input.csvNutrition,
    input.rawText,
  );
  const { compare, regex_payload, needs_nutrition_lm, needs_ingredients_lm, lm_called } =
    plan;

  let nutrition_source: LabelFieldSource = "missing";
  let ingredients_source: LabelFieldSource = "missing";
  let ingredients_raw: string | null = null;
  let nutrition: ProductNutrition | null = null;
  let serving_size: string | null =
    input.structured?.serving_size ?? regex_payload.serving_size ?? null;

  const ingStatus = compare.ingredients;
  const nutStatus = compare.nutrition;
  const csvHasIng = hasIngredients(input.csvIngredients);
  const csvHasNut = csvHasNutrition(input.csvNutrition);

  if (!needs_ingredients_lm && (ingStatus === "match" || ingStatus === "existing_only")) {
    ingredients_source = "csv";
    ingredients_raw = input.csvIngredients;
  } else {
    const resolved = resolveIngredientsText({
      structuredIngredients: input.structured?.ingredients,
      rawText: input.rawText,
      csvIngredients: input.csvIngredients,
      productName: input.productName,
    });
    ingredients_source = resolved.source;
    ingredients_raw = resolved.text;
    if (!ingredients_raw && csvHasIng) {
      ingredients_source = "csv";
      ingredients_raw = input.csvIngredients;
    }
  }

  if (!needs_nutrition_lm && (nutStatus === "match" || nutStatus === "existing_only")) {
    nutrition_source = "csv";
    nutrition = input.csvNutrition;
  } else if (input.structured) {
    const fromLm = structuredToProductNutrition(input.structured);
    if (fromLm) {
      nutrition_source = "llm";
      const merged =
        csvHasNut && input.csvNutrition
          ? mergeNutrition(input.csvNutrition, fromLm)
          : fromLm;
      nutrition = {
        ...(merged ?? fromLm),
        extra: {
          ...((merged ?? fromLm).extra ?? {}),
          nutrition_source: "llm",
        },
      };
      serving_size = input.structured.serving_size ?? serving_size;
    }
  } else if (regex_payload.nutrition_per_100g) {
    const fromOcr = ocrNutritionToProduct(regex_payload.nutrition_per_100g);
    if (countNutritionFields(fromOcr) >= 2) {
      nutrition_source = "ocr";
      nutrition = {
        ...fromOcr,
        source: "label",
        extra: { ...(fromOcr.extra ?? {}), nutrition_source: "ocr_regex" },
      };
    }
  } else if (csvHasNut) {
    nutrition_source = "csv";
    nutrition = input.csvNutrition;
  }

  if (nutrition && nutrition_source === "csv") {
    nutrition = {
      ...nutrition,
      extra: { ...(nutrition.extra ?? {}), nutrition_source: "csv" },
    };
  }

  let lm_skip_reason: string | undefined;
  if (!lm_called) {
    if (ingStatus === "match" && nutStatus === "match") {
      lm_skip_reason = "ocr_regex_matches_csv";
    } else if (ingStatus === "ocr_adds" || nutStatus === "ocr_adds") {
      lm_skip_reason = "ocr_regex_adds_fields";
    } else {
      lm_skip_reason = "csv_sufficient_no_mismatch";
    }
  }

  return {
    nutrition_source,
    ingredients_source,
    lm_called,
    lm_skip_reason,
    compare,
    ingredients_raw,
    nutrition,
    serving_size,
    regex_payload,
  };
}

export { compareIngredients, compareNutrition };

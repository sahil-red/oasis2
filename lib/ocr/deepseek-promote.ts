import type {
  DeepseekExtractionResult,
  ExtractedLabel,
  ValidationResult,
} from "@/lib/ocr/deepseek-label-extract";
import type { OcrCompareSummary, FieldCompareStatus } from "@/lib/ocr/compare-platform";
import type { ProductNutrition } from "@/lib/supabase/types";

type ExistingProductForPromotion = {
  id: string;
  zepto_sku?: string | null;
  product_key?: string | null;
  name: string;
  nutrition?: ProductNutrition | null;
  ingredients_raw?: string | null;
  attributes?: Record<string, string> | null;
  ocr_payload?: Record<string, unknown> | null;
};

export type DeepseekPromotionOptions = {
  force?: boolean;
  sourcePath?: string | null;
};

export type DeepseekPromotionPatch = {
  nutrition?: ProductNutrition | null;
  ingredients_raw?: string | null;
  attributes: Record<string, string>;
  ocr_payload: Record<string, unknown>;
  ocr_status: "success";
  ocr_attempted_at: string;
  updated_at: string;
};

export type DeepseekPromotionResult = {
  product_id: string;
  zepto_sku: string;
  name: string;
  promoted_nutrition: boolean;
  promoted_ingredients: boolean;
  compare: OcrCompareSummary;
  patch: DeepseekPromotionPatch;
};

export type DeepseekDisplayFacts = {
  chips: string[];
  chipLabels: string[];
  why: string | null;
};

const NUTRITION_KEYS: Array<keyof ProductNutrition> = [
  "energy_kcal_100g",
  "protein_g_100g",
  "fat_g_100g",
  "saturated_fat_g_100g",
  "trans_fat_g_100g",
  "carbs_g_100g",
  "sugar_g_100g",
  "added_sugar_g_100g",
  "fiber_g_100g",
  "sodium_mg_100g",
  "calcium_mg_100g",
  "iron_mg_100g",
];

function roundValue(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.round(value * 100) / 100;
}

function addNumber(out: ProductNutrition, key: keyof ProductNutrition, value: number | null | undefined) {
  const v = roundValue(value);
  if (v != null) {
    (out as Record<string, unknown>)[key] = v;
  }
}

export function nutritionFromDeepseek(extracted: ExtractedLabel): ProductNutrition | null {
  const n = extracted.nutrition.per_100g_or_100ml;
  const out: ProductNutrition = {
    source: "label",
    extra: {
      extraction_source: "deepseek_v4_flash",
      schema_version: String(extracted.schema_version),
    },
  };

  addNumber(out, "energy_kcal_100g", n.energy_kcal);
  addNumber(out, "protein_g_100g", n.protein_g);
  addNumber(out, "fat_g_100g", n.total_fat_g);
  addNumber(out, "saturated_fat_g_100g", n.saturated_fat_g);
  addNumber(out, "trans_fat_g_100g", n.trans_fat_g);
  addNumber(out, "carbs_g_100g", n.carbohydrate_g);
  addNumber(out, "sugar_g_100g", n.sugar_g);
  addNumber(out, "added_sugar_g_100g", n.added_sugar_g);
  addNumber(out, "fiber_g_100g", n.dietary_fiber_g);
  addNumber(out, "sodium_mg_100g", n.sodium_mg);
  addNumber(out, "calcium_mg_100g", n.calcium_mg);
  addNumber(out, "iron_mg_100g", n.iron_mg);

  if (extracted.nutrition.serving_size.value != null) {
    out.extra!.serving_size_value = extracted.nutrition.serving_size.value;
  }
  if (extracted.nutrition.serving_size.unit) {
    out.extra!.serving_size_unit = extracted.nutrition.serving_size.unit;
  }
  if (extracted.nutrition.servings_per_pack != null) {
    out.extra!.servings_per_pack = extracted.nutrition.servings_per_pack;
  }
  if (n.energy_kj != null) out.extra!.energy_kj_100g = n.energy_kj;
  if (n.cholesterol_mg != null) out.extra!.cholesterol_mg_100g = n.cholesterol_mg;
  if (n.potassium_mg != null) out.extra!.potassium_mg_100g = n.potassium_mg;
  if (n.vitamin_c_mg != null) out.extra!.vitamin_c_mg_100g = n.vitamin_c_mg;
  if (n.vitamin_d_mcg != null) out.extra!.vitamin_d_mcg_100g = n.vitamin_d_mcg;

  const numericCount = NUTRITION_KEYS.filter((key) => typeof out[key] === "number").length;
  return numericCount >= 2 ? out : null;
}

export function ingredientsFromDeepseek(extracted: ExtractedLabel): string | null {
  const text = extracted.ingredients.raw_list
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
  return text.length >= 10 ? text : null;
}

function countNutritionFields(nutrition: ProductNutrition | null | undefined): number {
  if (!nutrition) return 0;
  return NUTRITION_KEYS.filter((key) => typeof nutrition[key] === "number").length;
}

function compareNutritionFields(
  existing: ProductNutrition | null | undefined,
  next: ProductNutrition | null,
): NonNullable<OcrCompareSummary["nutrition_detail"]> {
  const existingFields = NUTRITION_KEYS.filter((key) => typeof existing?.[key] === "number").map(String);
  const nextFields = NUTRITION_KEYS.filter((key) => typeof next?.[key] === "number").map(String);
  const matched: string[] = [];
  const differing: string[] = [];

  for (const key of NUTRITION_KEYS) {
    const a = existing?.[key];
    const b = next?.[key];
    if (typeof a !== "number" || typeof b !== "number") continue;
    const denom = Math.max(Math.abs(a), Math.abs(b), 1);
    if (Math.abs(a - b) / denom <= 0.15) matched.push(String(key));
    else differing.push(String(key));
  }

  return {
    existing_fields: existingFields,
    ocr_fields: nextFields,
    matched_fields: matched,
    differing_fields: differing,
  };
}

function nutritionCompareStatus(
  existing: ProductNutrition | null | undefined,
  next: ProductNutrition | null,
): FieldCompareStatus {
  const ex = countNutritionFields(existing);
  const nx = countNutritionFields(next);
  if (!ex && !nx) return "both_missing";
  if (ex && !nx) return "existing_only";
  if (!ex && nx) return "ocr_adds";
  const detail = compareNutritionFields(existing, next);
  if (!detail.differing_fields.length) return "match";
  return "different";
}

function normalizeIngredientTokens(value: string | null | undefined): string[] {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9%,\s]/g, " ")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

function ingredientOverlap(existing: string | null | undefined, next: string | null): number {
  const a = normalizeIngredientTokens(existing);
  const b = normalizeIngredientTokens(next);
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  return a.filter((token) => setB.has(token)).length / Math.max(a.length, b.length);
}

function ingredientsCompareStatus(
  existing: string | null | undefined,
  next: string | null,
): FieldCompareStatus {
  const ex = Boolean(existing?.trim() && existing.trim().length >= 10);
  const nx = Boolean(next?.trim() && next.trim().length >= 10);
  if (!ex && !nx) return "both_missing";
  if (ex && !nx) return "existing_only";
  if (!ex && nx) return "ocr_adds";
  return ingredientOverlap(existing, next) >= 0.45 ? "match" : "different";
}

function joinValues(values: string[]): string | undefined {
  const text = values.map((v) => v.trim()).filter(Boolean).join(", ");
  return text || undefined;
}

function setAttr(attrs: Record<string, string>, key: string, value: string | number | null | undefined) {
  if (value == null) return;
  const text = String(value).trim();
  if (text) attrs[key] = text.slice(0, 1200);
}

function attributesFromDeepseek(
  existing: Record<string, string> | null | undefined,
  extracted: ExtractedLabel,
): Record<string, string> {
  const attrs = { ...(existing ?? {}) };
  setAttr(attrs, "DeepSeek Label Extracted", "true");
  setAttr(attrs, "DeepSeek Overall Confidence", extracted.confidence.overall);
  setAttr(attrs, "DeepSeek Nutrition Confidence", extracted.confidence.nutrition);
  setAttr(attrs, "DeepSeek Ingredients Confidence", extracted.confidence.ingredients);
  setAttr(attrs, "DeepSeek Confidence Notes", extracted.confidence.notes);
  setAttr(attrs, "Label Allergens", joinValues(extracted.allergens.contains));
  setAttr(attrs, "Label May Contain", joinValues(extracted.allergens.may_contain));
  setAttr(attrs, "Label Free From", joinValues(extracted.allergens.free_from_claims));
  setAttr(attrs, "Storage Instructions", extracted.storage_and_shelf_life.storage_instructions);
  setAttr(attrs, "Best Before", extracted.storage_and_shelf_life.best_before_format);
  setAttr(attrs, "Preparation Instructions", extracted.usage.preparation_instructions);
  setAttr(attrs, "Serving Suggestion", extracted.usage.serving_suggestion);
  setAttr(attrs, "Recommended Dosage", extracted.usage.recommended_dosage);
  setAttr(attrs, "Marketing Claims", joinValues(extracted.marketing_claims));
  setAttr(attrs, "Label Chips", joinValues(extracted.chips));
  setAttr(attrs, "Label Why", extracted.why);
  setAttr(attrs, "Label Manufacturer", extracted.regulatory.manufacturer);
  setAttr(attrs, "Label Marketed By", extracted.regulatory.marketed_by);
  setAttr(attrs, "Label Customer Care", extracted.regulatory.customer_care);
  setAttr(attrs, "Label Certifications", joinValues(extracted.regulatory.certifications));
  return attrs;
}

function shouldPromoteNutrition(
  existing: ProductNutrition | null | undefined,
  next: ProductNutrition | null,
  extracted: ExtractedLabel,
  force: boolean,
): boolean {
  if (!next) return false;
  if (force) return true;
  const existingCount = countNutritionFields(existing);
  const nextCount = countNutritionFields(next);
  if (existingCount === 0) return true;
  if (extracted.confidence.nutrition !== "high") return false;
  return nextCount >= existingCount;
}

function shouldPromoteIngredients(
  existing: string | null | undefined,
  next: string | null,
  extracted: ExtractedLabel,
  force: boolean,
): boolean {
  if (!next) return false;
  if (force) return true;
  if (!existing?.trim()) return true;
  if (extracted.confidence.ingredients !== "high") return false;
  return next.length >= existing.length * 0.5;
}

export function buildDeepseekPromotionPatch(
  product: ExistingProductForPromotion,
  result: DeepseekExtractionResult & { local_json?: string },
  options: DeepseekPromotionOptions = {},
): DeepseekPromotionResult | null {
  if (result.validation && !result.validation.ok && !options.force) return null;

  const extracted = result.extracted;
  const at = result.at ?? new Date().toISOString();
  const nutrition = nutritionFromDeepseek(extracted);
  const ingredients = ingredientsFromDeepseek(extracted);
  const promoteNutrition = shouldPromoteNutrition(
    product.nutrition,
    nutrition,
    extracted,
    Boolean(options.force),
  );
  const promoteIngredients = shouldPromoteIngredients(
    product.ingredients_raw,
    ingredients,
    extracted,
    Boolean(options.force),
  );

  const compare: OcrCompareSummary = {
    nutrition: nutritionCompareStatus(product.nutrition, nutrition),
    ingredients: ingredientsCompareStatus(product.ingredients_raw, ingredients),
    nutrition_detail: compareNutritionFields(product.nutrition, nutrition),
    ingredients_detail: {
      existing_len: product.ingredients_raw?.length ?? 0,
      ocr_ingredient_count: extracted.ingredients.raw_list.length,
      overlap_ratio: ingredientOverlap(product.ingredients_raw, ingredients),
    },
  };

  const previousPayload = product.ocr_payload && typeof product.ocr_payload === "object"
    ? product.ocr_payload
    : {};
  const patch: DeepseekPromotionPatch = {
    ...(promoteNutrition ? { nutrition } : {}),
    ...(promoteIngredients ? { ingredients_raw: ingredients } : {}),
    attributes: attributesFromDeepseek(product.attributes, extracted),
    ocr_status: "success",
    ocr_attempted_at: at,
    updated_at: at,
    ocr_payload: {
      ...previousPayload,
      label_resolution: {
        ...((previousPayload.label_resolution as Record<string, unknown> | undefined) ?? {}),
        nutrition_source: promoteNutrition ? "deepseek" : "existing",
        ingredients_source: promoteIngredients ? "deepseek" : "existing",
        lm_called: true,
        model: result.model,
        compare,
        resolved_at: at,
      },
      deepseek_label: {
        schema_version: extracted.schema_version,
        model: result.model,
        extracted_at: at,
        validation: result.validation as ValidationResult,
        confidence: extracted.confidence,
        chips: extracted.chips,
        chips_evidence: extracted.chips_evidence,
        why: extracted.why,
        extracted,
        usage: result.usage,
        response_metadata: result.response_metadata,
        local_json: result.local_json ?? options.sourcePath ?? null,
        promoted: {
          nutrition: promoteNutrition,
          ingredients: promoteIngredients,
          promoted_at: new Date().toISOString(),
        },
        previous_values: {
          nutrition: product.nutrition ?? null,
          ingredients_raw: product.ingredients_raw ?? null,
          attributes: product.attributes ?? null,
        },
      },
    },
  };

  return {
    product_id: product.id,
    zepto_sku: result.zepto_sku,
    name: product.name,
    promoted_nutrition: promoteNutrition,
    promoted_ingredients: promoteIngredients,
    compare,
    patch,
  };
}

export function deepseekLabelFromPayload(
  ocrPayload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const value = ocrPayload?.deepseek_label;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

export function formatDeepseekChip(chip: string): string {
  return chip
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function deepseekDisplayFromPayload(
  ocrPayload: Record<string, unknown> | null | undefined,
): DeepseekDisplayFacts | null {
  const label = deepseekLabelFromPayload(ocrPayload);
  if (!label) return null;
  const chips = stringArray(label.chips);
  const why = typeof label.why === "string" && label.why.trim() ? label.why.trim() : null;
  if (!chips.length && !why) return null;
  return {
    chips,
    chipLabels: chips.map(formatDeepseekChip),
    why,
  };
}

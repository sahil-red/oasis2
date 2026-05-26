import {
  hasIngredients,
  isPlatformNutritionComplete,
} from "@/lib/nutrition/completeness";
import { mergeOcrIntoProductNutrition } from "@/lib/nutrition/from-ocr";
import type { ProductNutrition } from "@/lib/supabase/types";
import { isOcrResultTrustworthy, type OcrTrustOptions } from "./confidence-gate";
import type { OcrPayload } from "./types";

export interface OcrApplyResult {
  payload: OcrPayload;
  imageUrl: string;
}

export interface ApplyOcrInput {
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  net_weight?: string | null;
}

export interface ApplyOcrResult {
  patch: Record<string, unknown>;
  applied: boolean;
  gate_reason: string;
  ocr_status: "success" | "no_label_found" | "failed";
}

export interface ApplyOcrOptions extends OcrTrustOptions {
  /** When true, skip OCR entirely for platform-complete rows. */
  skipPlatformComplete?: boolean;
  force?: boolean;
}

/** Build a product update patch from an OCR result, applying confidence gates. */
export function applyOcrToProduct(
  current: ApplyOcrInput,
  ocr: OcrApplyResult | null,
  opts: ApplyOcrOptions = {},
): ApplyOcrResult {
  const now = new Date().toISOString();
  const skipPlatformComplete = opts.skipPlatformComplete ?? true;

  if (
    skipPlatformComplete &&
    !opts.force &&
    isPlatformNutritionComplete(current.ingredients_raw, current.nutrition)
  ) {
    return {
      applied: false,
      gate_reason: "platform_complete",
      ocr_status: "success",
      patch: {
        ocr_status: "success",
        ocr_payload: { source: "platform", skipped_reason: "platform_complete" },
        ocr_attempted_at: now,
      },
    };
  }

  if (!ocr) {
    return {
      applied: false,
      gate_reason: "no_ocr_result",
      ocr_status: "no_label_found",
      patch: {
        ocr_status: "no_label_found",
        ocr_attempted_at: now,
      },
    };
  }

  const gate = isOcrResultTrustworthy(ocr.payload, opts);
  const payloadWithMeta: OcrPayload = {
    ...ocr.payload,
    confidence: {
      ...ocr.payload.confidence,
      overall: gate.adjustedConfidence,
      notes: [ocr.payload.confidence.notes, `gate:${gate.reason}`]
        .filter(Boolean)
        .join("; "),
    },
  };

  const basePatch: Record<string, unknown> = {
    ocr_image_url: ocr.imageUrl,
    ocr_payload: {
      ...payloadWithMeta,
      applied: gate.trustworthy,
      gate_reason: gate.reason,
    },
    ocr_attempted_at: now,
    updated_at: now,
  };

  if (!gate.trustworthy) {
    return {
      applied: false,
      gate_reason: gate.reason,
      ocr_status: "no_label_found",
      patch: {
        ...basePatch,
        ocr_status: "no_label_found",
      },
    };
  }

  const patch: Record<string, unknown> = { ...basePatch, ocr_status: "success" };

  if (
    !hasIngredients(current.ingredients_raw) &&
    ocr.payload.ingredients?.length
  ) {
    patch.ingredients_raw = ocr.payload.ingredients
      .map((ing) =>
        ing.percent != null ? `${ing.name} (${ing.percent}%)` : ing.name,
      )
      .join(", ");
  }

  const mergedNutrition = mergeOcrIntoProductNutrition(
    current.nutrition,
    ocr.payload.nutrition_per_100g,
  );
  if (
    mergedNutrition &&
    JSON.stringify(mergedNutrition) !== JSON.stringify(current.nutrition)
  ) {
    patch.nutrition = mergedNutrition;
  }

  if (!current.net_weight && ocr.payload.net_weight) {
    patch.net_weight = ocr.payload.net_weight;
  }

  return {
    applied: true,
    gate_reason: gate.reason,
    ocr_status: "success",
    patch,
  };
}

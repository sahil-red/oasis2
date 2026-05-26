import {
  hasIngredients,
  nutritionIsSparse,
} from "@/lib/nutrition/completeness";
import { getReferenceById } from "@/lib/nutrition/reference-seed";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { OcrPayload } from "@/lib/ocr/types";

export type ProvenanceKind =
  | "csv"
  | "reference"
  | "produce"
  | "ocr"
  | "platform"
  | "llm"
  | "missing";

export type FieldProvenance = {
  kind: ProvenanceKind;
  label: string;
  detail?: string;
  confidence?: number;
};

export type ProductProvenance = {
  nutrition: FieldProvenance;
  ingredients: FieldProvenance;
};

const PRODUCE_KINDS = new Set([
  "fruit",
  "vegetable",
  "leafy",
  "tuber",
  "gourd",
  "legume",
  "herb",
  "mushroom",
  "sprout",
  "pulse",
]);

export type ProvenanceInput = {
  nutrition: ProductNutrition | null;
  ingredients_raw: string | null;
  platform?: string | null;
  data_source?: string | null;
  ocr_status?: string | null;
  ocr_payload?: Record<string, unknown> | null;
};

function ocrPayload(input: ProvenanceInput): (OcrPayload & { applied?: boolean; gate_reason?: string }) | null {
  const p = input.ocr_payload;
  if (!p || typeof p !== "object") return null;
  return p as unknown as OcrPayload & { applied?: boolean; gate_reason?: string };
}

function referenceProvenance(
  extra: Record<string, number | string>,
): FieldProvenance {
  const refId = String(extra.reference_id ?? "");
  const entry = refId ? getReferenceById(refId) : null;
  const isProduce = entry != null && PRODUCE_KINDS.has(entry.kind);
  const conf =
    typeof extra.reference_confidence === "number"
      ? extra.reference_confidence
      : undefined;
  const match = extra.reference_match ? String(extra.reference_match) : undefined;
  const matchType = extra.reference_match_type
    ? String(extra.reference_match_type).replace(/_/g, " ")
    : undefined;

  return {
    kind: isProduce ? "produce" : "reference",
    label: isProduce ? "Produce reference (IFCT)" : "Staple reference (IFCT/USDA)",
    detail: [match && `Matched “${match}”`, matchType && `via ${matchType}`]
      .filter(Boolean)
      .join(" · "),
    confidence: conf,
  };
}

function inferNutritionProvenance(input: ProvenanceInput): FieldProvenance {
  const n = input.nutrition;
  if (!n || nutritionIsSparse(n)) {
    return { kind: "missing", label: "Not available" };
  }

  const extra = (n.extra ?? {}) as Record<string, number | string>;
  if (extra.reference || extra.reference_id) {
    return referenceProvenance(extra);
  }

  if (n.source === "label" || n.source === "ocr") {
    const ocr = ocrPayload(input);
    return {
      kind: "ocr",
      label: "Label OCR (Tesseract)",
      detail: ocr?.gate_reason ? `Gate: ${ocr.gate_reason}` : undefined,
      confidence: ocr?.confidence?.overall,
    };
  }

  if (n.source === "llm_text") {
    return { kind: "llm", label: "Text inference", detail: "Filled from product metadata" };
  }

  const ocr = ocrPayload(input);
  if (ocr?.applied === true && ocr.nutrition_per_100g) {
    return {
      kind: "ocr",
      label: "Label OCR (Tesseract)",
      detail: ocr.gate_reason ? `Gate: ${ocr.gate_reason}` : undefined,
      confidence: ocr.confidence?.overall,
    };
  }

  if (input.data_source === "csv" || input.platform === "zepto") {
    return {
      kind: "csv",
      label: "Zepto CSV",
      detail: "Structured nutrition from catalog export",
    };
  }

  if (n.source === "platform" || n.source === "off") {
    return {
      kind: "platform",
      label: n.source === "off" ? "Open Food Facts" : "Platform listing",
      detail: input.platform ?? undefined,
    };
  }

  return { kind: "platform", label: "Platform listing" };
}

function inferIngredientsProvenance(input: ProvenanceInput): FieldProvenance {
  if (!hasIngredients(input.ingredients_raw)) {
    return { kind: "missing", label: "Not available" };
  }

  const ocr = ocrPayload(input);
  if (
    ocr?.applied === true &&
    ocr.ingredients?.length &&
    input.ocr_status === "success"
  ) {
    return {
      kind: "ocr",
      label: "Label OCR (Tesseract)",
      detail: `${ocr.ingredients.length} ingredients read from pack image`,
      confidence: ocr.confidence?.overall,
    };
  }

  const extra = (input.nutrition?.extra ?? {}) as Record<string, number | string>;
  if (extra.reference || extra.reference_id) {
    const ref = referenceProvenance(extra);
    return {
      ...ref,
      detail: ref.detail
        ? `${ref.detail} · whole-food ingredient label`
        : "Whole-food ingredient label from reference table",
    };
  }

  if (input.data_source === "csv" || input.platform === "zepto") {
    return {
      kind: "csv",
      label: "Zepto CSV",
      detail: "Ingredient list from catalog export",
    };
  }

  if (input.platform === "blinkit" || input.data_source === "scrape") {
    return {
      kind: "platform",
      label: "Platform listing",
      detail: input.platform ?? "Blinkit PDP",
    };
  }

  return { kind: "csv", label: "Catalog import" };
}

export function buildProductProvenance(input: ProvenanceInput): ProductProvenance {
  return {
    nutrition: inferNutritionProvenance(input),
    ingredients: inferIngredientsProvenance(input),
  };
}

import { Agent, fetch as undiciFetch } from "undici";
import type { AppleRawOcrProduct } from "@/lib/ocr/apple-raw";
import type { ZeptoCsvRow } from "@/lib/zepto-import/csv-row";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

const cloudDispatcher = new Agent({
  connect: { rejectUnauthorized: false, timeout: 20_000 },
  bodyTimeout: 240_000,
  headersTimeout: 60_000,
});

export type ConfidenceLevel = "high" | "medium" | "low";

export type EvidenceRef = {
  image_index: number | null;
  variant: string | null;
  snippet: string;
  corrected?: boolean;
};

export type Quantity = {
  value: number | null;
  unit: string | null;
  evidence?: EvidenceRef | null;
};

export type ExtractedNutritionTable = Record<string, unknown>;

export type ExtractedLabel = {
  schema_version: 2;
  product: {
    name: string | null;
    brand: string | null;
    variant_flavor: string | null;
    net_quantity: Quantity;
    pack_type: string | null;
  };
  identity: {
    sku_id: string | null;
    barcode: string | null;
    fssai_license: string | null;
    country_of_origin: string | null;
    diet_symbols: string[];
  };
  ingredients: {
    raw_list: string[];
    contains_lines: string[];
    may_contain_lines: string[];
    evidence: EvidenceRef | null;
  };
  nutrition: {
    table_source: string | null;
    serving_size: { value: number | null; unit: string | null };
    servings_per_pack: number | null;
    per_100g_or_100ml: {
      energy_kcal: number | null;
      energy_kj: number | null;
      protein_g: number | null;
      carbohydrate_g: number | null;
      sugar_g: number | null;
      added_sugar_g: number | null;
      dietary_fiber_g: number | null;
      total_fat_g: number | null;
      saturated_fat_g: number | null;
      trans_fat_g: number | null;
      polyunsaturated_fat_g: number | null;
      monounsaturated_fat_g: number | null;
      cholesterol_mg: number | null;
      sodium_mg: number | null;
      calcium_mg: number | null;
      iron_mg: number | null;
      vitamin_c_mg: number | null;
      vitamin_d_mcg: number | null;
      potassium_mg: number | null;
    };
    per_serving: Record<string, unknown>;
    additional_tables: ExtractedNutritionTable[];
    rda_percent: Record<string, number | null>;
    evidence: EvidenceRef | null;
  };
  allergens: {
    contains: string[];
    may_contain: string[];
    free_from_claims: string[];
    evidence: EvidenceRef | null;
  };
  storage_and_shelf_life: {
    storage_instructions: string | null;
    shelf_life_months: number | null;
    best_before_format: string | null;
    evidence: EvidenceRef | null;
  };
  usage: {
    preparation_instructions: string | null;
    serving_suggestion: string | null;
    recommended_dosage: string | null;
    evidence: EvidenceRef | null;
  };
  regulatory: {
    manufacturer: string | null;
    marketed_by: string | null;
    customer_care: string | null;
    address: string | null;
    certifications: string[];
    evidence: EvidenceRef | null;
  };
  marketing_claims: string[];
  conflicts: Array<Record<string, unknown>>;
  confidence: {
    overall: ConfidenceLevel;
    ingredients: ConfidenceLevel;
    nutrition: ConfidenceLevel;
    notes: string | null;
  };
  chips: string[];
  chips_evidence: string[];
  why: string | null;
};

export type DeepseekExtractionResult = {
  zepto_sku: string;
  name: string;
  model: string;
  extracted: ExtractedLabel;
  validation: ValidationResult;
  raw_response: string;
  prompt_chars: number;
  at: string;
};

export type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
};

export type DeepseekExtractOptions = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export const DEEPSEEK_LABEL_SYSTEM_PROMPT = `
You are a strict food-label extraction engine for Indian grocery products.
Return exactly one valid JSON object. Do not output markdown, comments, or prose.

MISSION
Extract every useful fact printed on the package from the OCR text provided.
All OCR images have already been captured; your input is the complete set of frames for this SKU.
Do not invent, infer from food knowledge, or fill from category defaults.
Correct obvious OCR character-substitution errors, for example "Proteln" to "Protein", "Energv" to "Energy", and "Sodlum" to "Sodium", when the intended label text is unambiguous. Record the original OCR snippet as evidence so the correction is traceable.

EVIDENCE PRIORITY ORDER
When sources disagree, trust them in this order. Higher rank wins.
1. Nutrition Facts / Nutrition Information table (structured regulatory panel)
2. Ingredient / Composition declaration
3. Allergen declaration
4. Regulatory / manufacturer / FSSAI panel
5. Storage, shelf life, preparation instructions
6. Front-of-pack claims and call-outs
7. Product metadata (context only)

EXTRACTION RULES
1. Evidence citation:
Every non-null extracted value must include evidence where possible:
{ "image_index": <int>, "variant": "<original|gray_normalized_sharp|highres_gray_normalized_sharp|bw_threshold>", "snippet": "<exact OCR text>" }
When correcting an OCR typo, set "snippet" to the original OCR text and add "corrected": true to the evidence object.

2. Prefer regulatory panels:
Prefer Nutrition Facts / Nutrition Information tables over front-of-pack marketing claims.
Do not treat %RDA numbers as nutrient quantities. Keep %RDA only in nutrition.rda_percent.

3. Null for missing:
If a value is unclear, missing, or only implied, use null or an empty array.
Do not fill missing values from food knowledge or platform metadata.

4. Conflict handling:
If OCR variants disagree or sources of different priority disagree, resolve only when a higher-priority source is clearly superior. State which source won and why in conflicts[].
When no source is clearly superior, do not silently pick one. Preserve both values in conflicts[] and leave the field as null or the best available partial value.
Never silently overwrite a longer, higher-quality value with a shorter one.

5. Serving basis preservation:
Preserve the printed serving basis exactly. Normalize nutrition to per_100g_or_100ml only when the label clearly states per 100g/100ml, or conversion from serving size is mathematically unambiguous.

6. Multiple nutrition tables:
Many Indian products print more than one table, such as per serving, per 100g, dry mix, or prepared.
Prefer per 100g / per 100ml values for nutrition.per_100g_or_100ml.
When multiple serving bases exist, preserve all clearly labeled tables in nutrition.additional_tables.
Record which table was used as the primary source in nutrition.table_source.

7. Marketing claims separation:
Claims such as "40g protein", "no preservatives", "organic", "high fiber", "no added sugar", "gluten free", "lactose free", "probiotic", "low sugar", and "baked not fried" belong in marketing_claims[] unless the same value also appears in the Nutrition Facts table.

8. Ingredient rules:
Ingredients must be literal raw materials from an ingredient/composition declaration, not product names, taglines, claims, or recipe descriptions.
Preserve ingredient order exactly as printed. Do not sort alphabetically or by quantity.
Retain percentage annotations exactly as printed.
Retain INS/E-number annotations exactly as printed.
Preserve parenthetical sub-ingredients as nested structure when present, but also keep the original raw line in ingredients.raw_list.

9. Unit normalization:
Normalize quantity units to g, kg, ml, l, mcg, mg, kcal, kJ.
Use normalized values in structured fields. Preserve the original printed value in evidence snippets.

10. Metadata provenance:
Product metadata is provided as context only. It is never evidence.
Use metadata only for tie-breaking when OCR clearly references the same information.
Any field that cannot be sourced from OCR must remain null.
This rule applies especially to brand, flavor, net_quantity, and any numeric claim.

11. OCR typo correction:
Correct obvious single-character OCR substitution errors when the intended label text is unambiguous in context. Do not correct ambiguous fragments.
Record the original OCR snippet in evidence with "corrected": true.

12. Confidence scoring:
Set confidence using these definitions:
"high" means the value is directly visible in a structured label section with clear OCR quality (avg_confidence >= 0.85).
"medium" means the value is visible but OCR quality is imperfect (avg_confidence 0.65-0.84), or appears in a non-structured section.
"low" means the value is inferred from partial OCR, conflicting sources, or OCR confidence below 0.65.
Top-level confidence reflects the weakest field among ingredients and nutrition.

CHIPS AND WHY
After extraction, populate chips[] and why based on the structured data you just extracted, not from food category knowledge or metadata.

Recognized chip values and trigger conditions:
"high_sugar" - nutrition sugar_g per 100g > 10g, or "high sugar" / "sweetened" in ingredients/claims and no contradicting nutrition table
"low_sugar" - nutrition sugar_g per 100g <= 2.5g confirmed in nutrition table
"high_sodium" - nutrition sodium_mg per 100g > 600mg
"high_saturated_fat" - saturated_fat_g per 100g > 5g
"artificial_flavors" - ingredients contain "artificial flavouring", "artificial flavor", or INS flavour codes INS 627, INS 631, INS 635; do not apply for mint, cardamom, or named natural flavourings
"artificial_colors" - ingredients contain "artificial colour", "synthetic colour", or INS colour codes outside the permitted natural list: INS 100, 101, 120, 140, 150a-d, 160a-i, 162, 163, 170, 171, 172, 174, 175
"contains_preservatives" - ingredients contain a named preservative or INS 200-299 range
"high_gi" - refined flour (maida) or glucose syrup is the first or second ingredient, and no fiber claim is present
"high_protein" - protein_g per 100g >= 20g confirmed in nutrition table
"no_added_sugar" - marketing_claims contains "no added sugar" and sugar_g <= 5g in nutrition table; both conditions required
"gluten_free" - allergens.contains does not include gluten/wheat and marketing_claims contains "gluten free" or "gluten-free"
"vegan" - no dairy, egg, honey, or meat-derived ingredients detected
"contains_nuts" - allergens indicate nuts or tree nuts/peanuts appear in ingredients

Do not apply a chip if the evidence is ambiguous or confidence is low for the relevant field.
For each chip applied, include a one-line evidence note in chips_evidence[].

why is a single plain-English sentence of 25 words or fewer summarising the most important health signal for this product. Write it from label evidence, not category assumptions.

OUTPUT SCHEMA
{
  "schema_version": 2,
  "product": {
    "name": null,
    "brand": null,
    "variant_flavor": null,
    "net_quantity": { "value": null, "unit": null, "evidence": null },
    "pack_type": null
  },
  "identity": {
    "sku_id": null,
    "barcode": null,
    "fssai_license": null,
    "country_of_origin": null,
    "diet_symbols": []
  },
  "ingredients": {
    "raw_list": [],
    "contains_lines": [],
    "may_contain_lines": [],
    "evidence": null
  },
  "nutrition": {
    "table_source": null,
    "serving_size": { "value": null, "unit": null },
    "servings_per_pack": null,
    "per_100g_or_100ml": {
      "energy_kcal": null,
      "energy_kj": null,
      "protein_g": null,
      "carbohydrate_g": null,
      "sugar_g": null,
      "added_sugar_g": null,
      "dietary_fiber_g": null,
      "total_fat_g": null,
      "saturated_fat_g": null,
      "trans_fat_g": null,
      "polyunsaturated_fat_g": null,
      "monounsaturated_fat_g": null,
      "cholesterol_mg": null,
      "sodium_mg": null,
      "calcium_mg": null,
      "iron_mg": null,
      "vitamin_c_mg": null,
      "vitamin_d_mcg": null,
      "potassium_mg": null
    },
    "per_serving": {},
    "additional_tables": [],
    "rda_percent": {},
    "evidence": null
  },
  "allergens": {
    "contains": [],
    "may_contain": [],
    "free_from_claims": [],
    "evidence": null
  },
  "storage_and_shelf_life": {
    "storage_instructions": null,
    "shelf_life_months": null,
    "best_before_format": null,
    "evidence": null
  },
  "usage": {
    "preparation_instructions": null,
    "serving_suggestion": null,
    "recommended_dosage": null,
    "evidence": null
  },
  "regulatory": {
    "manufacturer": null,
    "marketed_by": null,
    "customer_care": null,
    "address": null,
    "certifications": [],
    "evidence": null
  },
  "marketing_claims": [],
  "conflicts": [],
  "confidence": {
    "overall": "high",
    "ingredients": "high",
    "nutrition": "high",
    "notes": null
  },
  "chips": [],
  "chips_evidence": [],
  "why": null
}
`.trim();

const NUTRIENT_KEYS = [
  "energy_kcal",
  "energy_kj",
  "protein_g",
  "carbohydrate_g",
  "sugar_g",
  "added_sugar_g",
  "dietary_fiber_g",
  "total_fat_g",
  "saturated_fat_g",
  "trans_fat_g",
  "polyunsaturated_fat_g",
  "monounsaturated_fat_g",
  "cholesterol_mg",
  "sodium_mg",
  "calcium_mg",
  "iron_mg",
  "vitamin_c_mg",
  "vitamin_d_mcg",
  "potassium_mg",
] as const;

function endpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((s): s is string => Boolean(s));
}

function asConfidence(value: unknown): ConfidenceLevel {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function asEvidence(value: unknown): EvidenceRef | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const snippet = asString(rec.snippet);
  if (!snippet) return null;
  return {
    image_index: typeof rec.image_index === "number" ? rec.image_index : null,
    variant: asString(rec.variant),
    snippet,
    ...(rec.corrected === true ? { corrected: true } : {}),
  };
}

function asQuantity(value: unknown): Quantity {
  const rec = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    value: asNumber(rec.value),
    unit: asString(rec.unit),
    evidence: asEvidence(rec.evidence),
  };
}

function blankNutrition(): ExtractedLabel["nutrition"]["per_100g_or_100ml"] {
  return Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, null])) as ExtractedLabel["nutrition"]["per_100g_or_100ml"];
}

function normalizeNutrition(value: unknown): ExtractedLabel["nutrition"]["per_100g_or_100ml"] {
  const out = blankNutrition();
  if (!value || typeof value !== "object") return out;
  const rec = value as Record<string, unknown>;
  for (const key of NUTRIENT_KEYS) out[key] = asNumber(rec[key]);
  return out;
}

function normalizeExtracted(raw: Record<string, unknown>, product: ZeptoCsvRow): ExtractedLabel {
  const p = raw.product && typeof raw.product === "object" ? raw.product as Record<string, unknown> : {};
  const id = raw.identity && typeof raw.identity === "object" ? raw.identity as Record<string, unknown> : {};
  const ing = raw.ingredients && typeof raw.ingredients === "object" ? raw.ingredients as Record<string, unknown> : {};
  const nut = raw.nutrition && typeof raw.nutrition === "object" ? raw.nutrition as Record<string, unknown> : {};
  const allergens = raw.allergens && typeof raw.allergens === "object" ? raw.allergens as Record<string, unknown> : {};
  const storage = raw.storage_and_shelf_life && typeof raw.storage_and_shelf_life === "object" ? raw.storage_and_shelf_life as Record<string, unknown> : {};
  const usage = raw.usage && typeof raw.usage === "object" ? raw.usage as Record<string, unknown> : {};
  const regulatory = raw.regulatory && typeof raw.regulatory === "object" ? raw.regulatory as Record<string, unknown> : {};
  const conf = raw.confidence && typeof raw.confidence === "object" ? raw.confidence as Record<string, unknown> : {};

  return {
    schema_version: 2,
    product: {
      name: asString(p.name),
      brand: asString(p.brand),
      variant_flavor: asString(p.variant_flavor),
      net_quantity: asQuantity(p.net_quantity),
      pack_type: asString(p.pack_type),
    },
    identity: {
      sku_id: asString(id.sku_id) ?? product.zepto_sku,
      barcode: asString(id.barcode),
      fssai_license: asString(id.fssai_license),
      country_of_origin: asString(id.country_of_origin),
      diet_symbols: asStringArray(id.diet_symbols),
    },
    ingredients: {
      raw_list: asStringArray(ing.raw_list),
      contains_lines: asStringArray(ing.contains_lines),
      may_contain_lines: asStringArray(ing.may_contain_lines),
      evidence: asEvidence(ing.evidence),
    },
    nutrition: {
      table_source: asString(nut.table_source),
      serving_size: {
        value: asNumber((nut.serving_size as Record<string, unknown> | undefined)?.value),
        unit: asString((nut.serving_size as Record<string, unknown> | undefined)?.unit),
      },
      servings_per_pack: asNumber(nut.servings_per_pack),
      per_100g_or_100ml: normalizeNutrition(nut.per_100g_or_100ml),
      per_serving: nut.per_serving && typeof nut.per_serving === "object" ? nut.per_serving as Record<string, unknown> : {},
      additional_tables: Array.isArray(nut.additional_tables) ? nut.additional_tables.filter((x): x is ExtractedNutritionTable => Boolean(x && typeof x === "object")) : [],
      rda_percent: nut.rda_percent && typeof nut.rda_percent === "object"
        ? Object.fromEntries(Object.entries(nut.rda_percent as Record<string, unknown>).map(([k, v]) => [k, asNumber(v)]))
        : {},
      evidence: asEvidence(nut.evidence),
    },
    allergens: {
      contains: asStringArray(allergens.contains),
      may_contain: asStringArray(allergens.may_contain),
      free_from_claims: asStringArray(allergens.free_from_claims),
      evidence: asEvidence(allergens.evidence),
    },
    storage_and_shelf_life: {
      storage_instructions: asString(storage.storage_instructions),
      shelf_life_months: asNumber(storage.shelf_life_months),
      best_before_format: asString(storage.best_before_format),
      evidence: asEvidence(storage.evidence),
    },
    usage: {
      preparation_instructions: asString(usage.preparation_instructions),
      serving_suggestion: asString(usage.serving_suggestion),
      recommended_dosage: asString(usage.recommended_dosage),
      evidence: asEvidence(usage.evidence),
    },
    regulatory: {
      manufacturer: asString(regulatory.manufacturer),
      marketed_by: asString(regulatory.marketed_by),
      customer_care: asString(regulatory.customer_care),
      address: asString(regulatory.address),
      certifications: asStringArray(regulatory.certifications),
      evidence: asEvidence(regulatory.evidence),
    },
    marketing_claims: asStringArray(raw.marketing_claims),
    conflicts: Array.isArray(raw.conflicts) ? raw.conflicts.filter((x): x is Record<string, unknown> => Boolean(x && typeof x === "object")) : [],
    confidence: {
      overall: asConfidence(conf.overall),
      ingredients: asConfidence(conf.ingredients),
      nutrition: asConfidence(conf.nutrition),
      notes: asString(conf.notes),
    },
    chips: asStringArray(raw.chips),
    chips_evidence: asStringArray(raw.chips_evidence),
    why: asString(raw.why),
  };
}

function addIssue(issues: ValidationIssue[], severity: "error" | "warning", code: string, message: string) {
  issues.push({ severity, code, message });
}

function hasEvidence(evidence: EvidenceRef | null): boolean {
  return Boolean(evidence?.snippet?.trim());
}

export function validateExtractedLabel(extracted: ExtractedLabel): ValidationResult {
  const issues: ValidationIssue[] = [];
  const n = extracted.nutrition.per_100g_or_100ml;
  const nutritionValues = Object.entries(n).filter(([, value]) => typeof value === "number");
  const ingredientsPresent = extracted.ingredients.raw_list.length > 0;

  if (ingredientsPresent && !hasEvidence(extracted.ingredients.evidence)) {
    addIssue(issues, "warning", "ingredients_missing_evidence", "Ingredients were extracted without statement-level evidence.");
  }
  if (nutritionValues.length && !hasEvidence(extracted.nutrition.evidence)) {
    addIssue(issues, "warning", "nutrition_missing_evidence", "Nutrition values were extracted without table-level evidence.");
  }
  if (n.saturated_fat_g != null && n.total_fat_g != null && n.saturated_fat_g > n.total_fat_g + 0.2) {
    addIssue(issues, "error", "sat_fat_gt_total_fat", "Saturated fat exceeds total fat.");
  }
  if (n.trans_fat_g != null && n.total_fat_g != null && n.trans_fat_g > n.total_fat_g + 0.2) {
    addIssue(issues, "error", "trans_fat_gt_total_fat", "Trans fat exceeds total fat.");
  }
  if (n.added_sugar_g != null && n.sugar_g != null && n.added_sugar_g > n.sugar_g + 0.2) {
    addIssue(issues, "error", "added_sugar_gt_total_sugar", "Added sugar exceeds total sugar.");
  }
  for (const [key, value] of Object.entries(n)) {
    if (typeof value === "number" && value < 0) {
      addIssue(issues, "error", "negative_nutrient", `${key} is negative.`);
    }
  }

  const macroTotal = (n.protein_g ?? 0) + (n.carbohydrate_g ?? 0) + (n.total_fat_g ?? 0) + (n.dietary_fiber_g ?? 0);
  if (macroTotal > 125) {
    addIssue(issues, "warning", "macro_total_high", "Protein + carbs + fat + fiber is implausibly high per 100g/ml.");
  }

  if (n.energy_kcal != null && n.protein_g != null && n.carbohydrate_g != null && n.total_fat_g != null) {
    const macroEnergy = n.protein_g * 4 + n.carbohydrate_g * 4 + n.total_fat_g * 9;
    const delta = Math.abs(n.energy_kcal - macroEnergy) / Math.max(n.energy_kcal, macroEnergy, 1);
    if (delta > 0.35) {
      addIssue(issues, "warning", "energy_macro_mismatch", "Energy differs substantially from protein/carbs/fat formula.");
    }
  }

  if (extracted.chips.length !== extracted.chips_evidence.length) {
    addIssue(issues, "warning", "chip_evidence_mismatch", "chips_evidence should contain one note per chip.");
  }
  if (extracted.why && extracted.why.split(/\s+/).length > 25) {
    addIssue(issues, "warning", "why_too_long", "why should be 25 words or fewer.");
  }

  return { ok: !issues.some((issue) => issue.severity === "error"), issues };
}

export function buildDeepseekUserPrompt(params: {
  product: ZeptoCsvRow;
  raw: AppleRawOcrProduct;
  maxChars?: number;
}): string {
  const maxChars = params.maxChars ?? 0;
  const product = params.product;
  const frames = params.raw.images.flatMap((image) =>
    image.variants.flatMap((variant) => {
      const text = variant.raw_text.trim();
      if (!text) return [];
      return [{
        image_index: image.index,
        variant: variant.variant,
        avg_confidence: variant.avg_confidence ?? 0,
        low_confidence: image.quality.low_confidence ? 1 : 0,
        text,
      }];
    }),
  );

  const metaBlock = `PRODUCT METADATA (platform data - may contain errors; use as context only, never as label evidence; fields must remain null if not found in OCR):\n${JSON.stringify({
    zepto_sku: product.zepto_sku,
    name: product.name,
    brand: product.brand,
    category: product.category,
    subcategory: product.subcategory,
    l3_category: product.l3_category,
    pack_size: product.pack_size,
    platform_ingredients: product.ingredients_raw,
    platform_nutrition: product.nutrition,
  }, null, 2)}`;

  let ocrBlock = frames
    .map((frame) =>
      `--- image_index=${frame.image_index} variant=${frame.variant} avg_confidence=${frame.avg_confidence.toFixed(2)} low_confidence=${frame.low_confidence.toFixed(2)} ---\n${frame.text}`,
    )
    .join("\n\n");
  if (maxChars > 0 && ocrBlock.length > maxChars) {
    ocrBlock = `${ocrBlock.slice(0, maxChars)}\n\n[TRUNCATED_TO_${maxChars}_CHARS]`;
  }

  return `${metaBlock}\n\nOCR TEXT - ALL FRAMES (use all frames; merge and deduplicate as needed):\n${ocrBlock || "[no OCR text]"}`;
}

async function callDeepseek(messages: Array<{ role: "system" | "user"; content: string }>, opts: Required<DeepseekExtractOptions>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await undiciFetch(endpoint(opts.baseUrl), {
      method: "POST",
      dispatcher: opts.baseUrl.startsWith("https://") ? cloudDispatcher : undefined,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: controller.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      let message = body;
      try {
        message = (JSON.parse(body) as ChatResponse).error?.message ?? body;
      } catch {
        // keep response body
      }
      throw new Error(`DeepSeek ${res.status}: ${message.slice(0, 1000)}`);
    }
    const parsed = JSON.parse(body) as ChatResponse;
    const content = parsed.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek returned no message content");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function extractLabelWithDeepseek(params: {
  product: ZeptoCsvRow;
  raw: AppleRawOcrProduct;
  opts?: DeepseekExtractOptions;
  maxInputChars?: number;
}): Promise<DeepseekExtractionResult> {
  const opts: Required<DeepseekExtractOptions> = {
    baseUrl: params.opts?.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL,
    apiKey: params.opts?.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "",
    model: params.opts?.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL,
    temperature: params.opts?.temperature ?? 0,
    maxTokens: params.opts?.maxTokens ?? 5000,
    timeoutMs: params.opts?.timeoutMs ?? 120_000,
  };
  if (!opts.apiKey) throw new Error("Missing DEEPSEEK_API_KEY");

  const userPrompt = buildDeepseekUserPrompt({
    product: params.product,
    raw: params.raw,
    maxChars: params.maxInputChars,
  });
  const rawResponse = await callDeepseek([
    { role: "system", content: DEEPSEEK_LABEL_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ], opts);
  const parsed = JSON.parse(extractJsonObject(rawResponse)) as Record<string, unknown>;
  const extracted = normalizeExtracted(parsed, params.product);
  const validation = validateExtractedLabel(extracted);

  return {
    zepto_sku: params.product.zepto_sku,
    name: params.product.name,
    model: opts.model,
    extracted,
    validation,
    raw_response: rawResponse,
    prompt_chars: DEEPSEEK_LABEL_SYSTEM_PROMPT.length + userPrompt.length,
    at: new Date().toISOString(),
  };
}

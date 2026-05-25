/**
 * Gemini multimodal OCR.
 *
 * One image in → fully structured `OcrPayload` out, in a single call.
 * We use `responseMimeType: "application/json"` plus a JSON schema so
 * Gemini returns parseable JSON every time (no markdown fences, no
 * "Sure! Here's the data: …" preambles).
 *
 * Model choice: `gemini-3.1-flash-lite` (or `gemini-2.5-flash-lite` per
 * env). Both have strong multimodal grounding and generous free-tier
 * quotas (~1500 req/day, ~15 req/min). Cost-per-token is irrelevant on
 * free tier, but Lite is also the fastest, which matters when we're
 * processing ~10k labels in batches.
 */

import { GoogleGenAI, Type } from "@google/genai";
import type { OcrPayload } from "./types";

let cachedClient: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("[ocr/gemini] GEMINI_API_KEY not set in env.");
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

const SYSTEM_PROMPT = `You are an expert label OCR engine for Indian packaged food products.

You will receive ONE photograph that is supposed to be the back label of a
packaged food product sold on an Indian quick-commerce app (Blinkit / Zepto /
Instamart). FSSAI rules mandate that every such pack prints:
  • An "Ingredients" list, in English, in descending order by weight, with %
    of characterising ingredients in brackets.
  • A "Nutritional Information" table per 100 g (or per 100 ml). Sometimes
    also "per serving".
  • Net quantity, serving size, allergen statement, FSSAI license #,
    manufacturer, country of origin.
  • Vegetarian (green dot) / non-vegetarian (brown dot) symbol.

EXTRACT EVERY FIELD that is visible. Be conservative:
  - Numeric values should be exact as printed (do NOT round, do NOT convert
    units except as noted below).
  - For the "per 100 g" panel, output grams for macros and milligrams for
    sodium / calcium / iron / cholesterol. If the label only gives per
    serving, fill nutrition_per_serve, then also fill nutrition_per_100g
    by scaling using the serving_size (e.g. 30 g serving → multiply by 100/30).
  - For ingredients, preserve label order. If an ingredient has a parenthetical
    breakdown (e.g. "Wheat flour (Maida, Atta 5%)"), extract the inner items
    into sub_ingredients[]. If a % is disclosed, fill the percent field.
  - If a field is not visible on this image, OMIT IT. Do not invent values.
    Do not fall back to background knowledge of the product.
  - If the image is clearly NOT a back label (e.g. it's the front of pack,
    a marketing render, or unreadable), still return JSON but set
    confidence.has_ingredients=false, confidence.has_nutrition_table=false,
    and confidence.overall=0. Leave other fields empty.

Output JSON only — no markdown, no commentary.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ingredients: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          percent: { type: Type.NUMBER },
          sub_ingredients: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["name"],
      },
    },
    nutrition_per_100g: {
      type: Type.OBJECT,
      properties: {
        energy_kcal: { type: Type.NUMBER },
        protein_g: { type: Type.NUMBER },
        fat_g: { type: Type.NUMBER },
        saturated_fat_g: { type: Type.NUMBER },
        trans_fat_g: { type: Type.NUMBER },
        carbs_g: { type: Type.NUMBER },
        sugar_g: { type: Type.NUMBER },
        added_sugar_g: { type: Type.NUMBER },
        fiber_g: { type: Type.NUMBER },
        sodium_mg: { type: Type.NUMBER },
        calcium_mg: { type: Type.NUMBER },
        iron_mg: { type: Type.NUMBER },
        cholesterol_mg: { type: Type.NUMBER },
      },
    },
    nutrition_per_serve: {
      type: Type.OBJECT,
      properties: {
        energy_kcal: { type: Type.NUMBER },
        protein_g: { type: Type.NUMBER },
        fat_g: { type: Type.NUMBER },
        saturated_fat_g: { type: Type.NUMBER },
        trans_fat_g: { type: Type.NUMBER },
        carbs_g: { type: Type.NUMBER },
        sugar_g: { type: Type.NUMBER },
        added_sugar_g: { type: Type.NUMBER },
        fiber_g: { type: Type.NUMBER },
        sodium_mg: { type: Type.NUMBER },
      },
    },
    serving_size: { type: Type.STRING },
    net_weight: { type: Type.STRING },
    allergens: { type: Type.ARRAY, items: { type: Type.STRING } },
    fssai_license: { type: Type.STRING },
    manufacturer: { type: Type.STRING },
    origin: { type: Type.STRING },
    labels: { type: Type.ARRAY, items: { type: Type.STRING } },
    confidence: {
      type: Type.OBJECT,
      properties: {
        overall: { type: Type.NUMBER },
        has_ingredients: { type: Type.BOOLEAN },
        has_nutrition_table: { type: Type.BOOLEAN },
        notes: { type: Type.STRING },
      },
      required: ["overall", "has_ingredients", "has_nutrition_table"],
    },
  },
  required: ["confidence"],
};

export interface GeminiOcrOptions {
  /** Defaults to env GEMINI_MODEL or "gemini-3.1-flash-lite". */
  model?: string;
  /** Pass through to the SDK if the caller wants to tweak. */
  temperature?: number;
}

export async function geminiOcr(
  imageBytes: Buffer,
  mimeType: string = "image/png",
  opts: GeminiOcrOptions = {},
): Promise<OcrPayload> {
  const model =
    opts.model ?? process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";

  const result = await client().models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: imageBytes.toString("base64") } },
          { text: "Extract per the system instructions." },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: opts.temperature ?? 0,
      // Lite models can occasionally truncate large nutrition tables; cap
      // is generous so the schema-bounded output always fits.
      maxOutputTokens: 2048,
    },
  });

  const text = result.text ?? "{}";
  let parsed: Partial<OcrPayload>;
  try {
    parsed = JSON.parse(text) as Partial<OcrPayload>;
  } catch (err) {
    throw new Error(
      `[ocr/gemini] failed to parse JSON response: ${(err as Error).message}\n` +
        `--- raw ---\n${text.slice(0, 500)}\n`,
    );
  }

  return {
    ingredients: parsed.ingredients ?? [],
    nutrition_per_100g: parsed.nutrition_per_100g,
    nutrition_per_serve: parsed.nutrition_per_serve,
    serving_size: parsed.serving_size,
    net_weight: parsed.net_weight,
    allergens: parsed.allergens ?? [],
    fssai_license: parsed.fssai_license,
    manufacturer: parsed.manufacturer,
    origin: parsed.origin,
    labels: parsed.labels ?? [],
    confidence: parsed.confidence ?? {
      overall: 0,
      has_ingredients: false,
      has_nutrition_table: false,
    },
    backend: "gemini",
    model,
  };
}

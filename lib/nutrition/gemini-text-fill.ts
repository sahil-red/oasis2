/**
 * Text-only Gemini fill for products where Blinkit + Tesseract OCR failed.
 * No vision, no Google Search — model uses product context only.
 */
import { Type } from "@google/genai";
import pThrottle from "p-throttle";
import { geminiClient, geminiTextModel } from "@/lib/gemini/client";
import { reconcileNutrition, nutritionLooksImplausible } from "@/lib/nutrition/sanity";
import type { ProductNutrition } from "@/lib/supabase/types";

export type TextFillInput = {
  slug: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  net_weight: string | null;
  /** Key Blinkit attribute lines (ingredients snippet, description, partial nutrition block). */
  context: string;
  partial_nutrition: ProductNutrition | null;
  partial_ingredients: string | null;
  attributes: Record<string, string> | null;
};

export type TextFillOutput = {
  slug: string;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  confidence: number;
  notes: string | null;
};

/** Default SKUs per Gemini request (user preference: ~10). */
export const GEMINI_TEXT_BATCH_SIZE = Number(process.env.GEMINI_TEXT_BATCH_SIZE ?? 10);

const SYSTEM = `You fill missing FSSAI-style nutrition (per 100g) and ingredients for Indian grocery SKUs (Blinkit / Zepto).

Product types:
- Packaged foods: parse CONTEXT nutrition/ingredients faithfully when present.
- Fresh produce (fruits, vegetables, herbs): single-ingredient; use credible USDA / IFCT / ICMR per-100g values for the named item (raw, edible portion). ingredients_raw = the food name only (e.g. "Tomato").
- Raw animal proteins (chicken, fish, mutton, eggs, paneer): single-ingredient; use standard raw per-100g references for that cut/species in India. ingredients_raw = descriptive single line (e.g. "Chicken breast, raw").
- Do NOT mix cooked/restaurant values for raw meat/fish listings.

Rules:
- Prefer CONTEXT numbers when a label or PDP block is provided.
- Without CONTEXT, use well-established reference data for that exact product type; set confidence 0.45–0.65 and note the source class in notes (e.g. "USDA raw chicken breast").
- Never invent extreme values (protein > 40g/100g for cereal; carbs near zero for rice, etc.).
- Output per 100g: energy_kcal, protein_g, fat_g, carbs_g, sugar_g, fiber_g, sodium_mg when known.
- ingredients_raw: comma-separated label order for packaged; single ingredient for fresh/raw proteins.

Return JSON only.`;

const ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    slug: { type: Type.STRING },
    ingredients_raw: { type: Type.STRING, nullable: true },
    energy_kcal_100g: { type: Type.NUMBER, nullable: true },
    protein_g_100g: { type: Type.NUMBER, nullable: true },
    fat_g_100g: { type: Type.NUMBER, nullable: true },
    carbs_g_100g: { type: Type.NUMBER, nullable: true },
    sugar_g_100g: { type: Type.NUMBER, nullable: true },
    fiber_g_100g: { type: Type.NUMBER, nullable: true },
    sodium_mg_100g: { type: Type.NUMBER, nullable: true },
    confidence: { type: Type.NUMBER },
    notes: { type: Type.STRING, nullable: true },
  },
  required: ["slug", "confidence"],
};

const BATCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: { type: Type.ARRAY, items: ITEM_SCHEMA },
  },
  required: ["items"],
};

const rpm = Number(process.env.GEMINI_RPM ?? 10);
async function generateWithRetry(prompt: string, retries = 3): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await geminiClient().models.generateContent({
        model: geminiTextModel(),
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          systemInstruction: SYSTEM,
          responseMimeType: "application/json",
          responseSchema: BATCH_SCHEMA,
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      });
      return result.text ?? "{}";
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      if (status === 503 || status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const throttledGenerate = pThrottle({ limit: 1, interval: Math.ceil(60_000 / rpm) })(
  generateWithRetry,
);

function buildPrompt(batch: TextFillInput[]): string {
  const blocks = batch.map((p) => {
    const partial = p.partial_nutrition
      ? `Partial nutrition JSON: ${JSON.stringify(p.partial_nutrition)}`
      : "Partial nutrition: none";
    const ing = p.partial_ingredients
      ? `Partial ingredients: ${p.partial_ingredients.slice(0, 400)}`
      : "Partial ingredients: none";
    return [
      `---`,
      `slug: ${p.slug}`,
      `name: ${p.name}`,
      `brand: ${p.brand ?? ""}`,
      `category: ${p.category ?? ""} / ${p.subcategory ?? ""}`,
      `net_weight: ${p.net_weight ?? ""}`,
      partial,
      ing,
      `CONTEXT:\n${p.context.slice(0, 2000)}`,
    ].join("\n");
  });
  return `Fill nutrition and ingredients for ${batch.length} products:\n${blocks.join("\n")}`;
}

function rowToNutrition(row: Record<string, unknown>): ProductNutrition | null {
  const n: ProductNutrition = { source: "llm_text" };
  const map: Array<[string, string]> = [
    ["energy_kcal_100g", "energy_kcal_100g"],
    ["protein_g_100g", "protein_g_100g"],
    ["fat_g_100g", "fat_g_100g"],
    ["carbs_g_100g", "carbs_g_100g"],
    ["sugar_g_100g", "sugar_g_100g"],
    ["fiber_g_100g", "fiber_g_100g"],
    ["sodium_mg_100g", "sodium_mg_100g"],
  ];
  let any = false;
  for (const [k, outK] of map) {
    const v = row[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      (n as Record<string, number>)[outK] = v;
      any = true;
    }
  }
  return any ? n : null;
}

function parseItems(raw: string): Record<string, unknown>[] {
  const parsed = JSON.parse(raw) as { items?: Record<string, unknown>[] };
  return parsed.items ?? [];
}

function applyItems(slice: TextFillInput[], items: Record<string, unknown>[]): TextFillOutput[] {
  const out: TextFillOutput[] = [];
  const bySlug = new Map(items.map((it) => [String(it.slug), it]));
  for (const inp of slice) {
      const row = bySlug.get(inp.slug);
      if (!row) continue;
      const conf = typeof row.confidence === "number" ? row.confidence : 0;
      if (conf < 0.35) continue;

      let nutrition = rowToNutrition(row);
      const ingredients_raw =
        typeof row.ingredients_raw === "string" && row.ingredients_raw.trim()
          ? row.ingredients_raw.trim()
          : null;

      if (nutrition) {
        nutrition = reconcileNutrition({
          nutrition: { ...inp.partial_nutrition, ...nutrition, source: "llm_text" },
          attributes: inp.attributes,
          name: inp.name,
          category: inp.category,
          net_weight: inp.net_weight,
        });
        if (nutrition && nutritionLooksImplausible(nutrition, inp.name, inp.category)) {
          nutrition = null;
        }
      }

      if (!nutrition && !ingredients_raw) continue;

    out.push({
      slug: inp.slug,
      ingredients_raw: ingredients_raw ?? inp.partial_ingredients,
      nutrition,
      confidence: conf,
      notes: typeof row.notes === "string" ? row.notes : null,
    });
  }
  return out;
}

export async function geminiTextFillBatch(
  batch: TextFillInput[],
  batchSize = GEMINI_TEXT_BATCH_SIZE,
): Promise<TextFillOutput[]> {
  const out: TextFillOutput[] = [];
  for (let i = 0; i < batch.length; i += batchSize) {
    const slice = batch.slice(i, i + batchSize);
    try {
      const raw = await throttledGenerate(buildPrompt(slice));
      try {
        out.push(...applyItems(slice, parseItems(raw)));
      } catch (err) {
        console.warn(`[gemini-text-fill] batch JSON failed, trying 1-by-1: ${(err as Error).message}`);
        for (const one of slice) {
          try {
            const singleRaw = await throttledGenerate(buildPrompt([one]));
            out.push(...applyItems([one], parseItems(singleRaw)));
          } catch (inner) {
            console.warn(`[gemini-text-fill] ${one.slug}: ${(inner as Error).message}`);
          }
        }
      }
    } catch (err) {
      console.warn(`[gemini-text-fill] API error: ${(err as Error).message}`);
    }
  }
  return out;
}

export function buildTextFillContext(attrs: Record<string, string>): string {
  const keys = [
    "Nutrition Information",
    "Ingredients",
    "Description",
    "Key Features",
    "Allergen Information",
    "Type",
    "Flavour",
  ];
  const lines: string[] = [];
  for (const k of keys) {
    const v = attrs[k]?.trim();
    if (v) lines.push(`${k}:\n${v}`);
  }
  return lines.join("\n\n");
}

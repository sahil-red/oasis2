import { formatIngredientsList } from "@/lib/ocr/format-ingredients";
import { buildLmStructureUserPayload } from "@/lib/ocr/lm-ingredients-anchor";
import { withLmStudioLock } from "@/lib/lm/studio-lock";

const DEFAULT_BASE = "http://127.0.0.1:1234/v1";
const DEFAULT_MODEL = "qwen2.5coder7b:2";

export const LM_STRUCTURE_SYSTEM_PROMPT = `You are a rigid data processing utility. Extract both ingredients and nutrition facts from the following raw text into a valid, flat JSON object.

CRITICAL INGREDIENT RULES:
1. The "ingredients" field must contain the literal, technical, comma-separated list of raw materials (e.g., "milk solids, active lactic culture, sugar").
2. NEVER use the product name, marketing titles, front-of-pack descriptors, or brand names (like "Probiotic Dahi", "Potato Chips", or "Mango Juice") as the ingredients list.
3. If you see a prominent product title and a separate technical ingredients list, completely ignore the product title and extract ONLY the technical list.
4. Do not output markdown backticks, conversational preamble, or explanations. If a data item is missing, mark it null.

All nutrition numbers must be normalized per 100g (or per 100ml for liquids). If the label only shows per-serving values, convert them to per 100g using the serving size before outputting.

JSON Target Schema:
{
  "serving_size": string or null,
  "calories_100g": number or null,
  "protein_g_100g": number or null,
  "carbs_g_100g": number or null,
  "fat_g_100g": number or null,
  "fiber_g_100g": number or null,
  "sugar_g_100g": number or null,
  "sodium_mg_100g": number or null,
  "ingredients": string or null
}`;

export type StructuredLabel = {
  serving_size: string | null;
  calories_100g: number | null;
  protein_g_100g: number | null;
  carbs_g_100g: number | null;
  fat_g_100g: number | null;
  fiber_g_100g: number | null;
  sugar_g_100g: number | null;
  sodium_mg_100g: number | null;
  ingredients: string | null;
};

export type LmStudioOptions = {
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

function lmEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

/** Strip fences / preamble so JSON.parse can run on model output. */
export function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function coerceNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function coerceString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Accept flat _100g keys or legacy unprefixed keys from older model outputs. */
export function normalizeStructuredLabel(raw: Record<string, unknown>): StructuredLabel {
  return {
    serving_size: coerceString(raw.serving_size),
    calories_100g:
      coerceNumber(raw.calories_100g) ?? coerceNumber(raw.calories),
    protein_g_100g:
      coerceNumber(raw.protein_g_100g) ?? coerceNumber(raw.protein_g),
    carbs_g_100g: coerceNumber(raw.carbs_g_100g) ?? coerceNumber(raw.carbs_g),
    fat_g_100g: coerceNumber(raw.fat_g_100g) ?? coerceNumber(raw.fat_g),
    fiber_g_100g: coerceNumber(raw.fiber_g_100g) ?? coerceNumber(raw.fiber_g),
    sugar_g_100g: coerceNumber(raw.sugar_g_100g) ?? coerceNumber(raw.sugar_g),
    sodium_mg_100g:
      coerceNumber(raw.sodium_mg_100g) ?? coerceNumber(raw.sodium_mg),
    ingredients: formatIngredientsList(coerceString(raw.ingredients)),
  };
}

const LM_RETRY_SUFFIX =
  "\n\nCRITICAL: Output JSON with numeric literals only (e.g. 12.5). No formulas, parentheses, or arithmetic expressions.";

async function callLm(
  baseUrl: string,
  model: string,
  temperature: number,
  maxTokens: number,
  signal: AbortSignal,
  userContent: string,
  jsonMode: boolean,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    temperature,
    max_tokens: maxTokens,
    stream: false,
    messages: [
      { role: "system", content: LM_STRUCTURE_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  let res = await fetch(lmEndpoint(baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(body),
  });

  if (!res.ok && jsonMode) {
    const errBody = await res.text().catch(() => "");
    if (res.status === 400 && /response_format|json_object/i.test(errBody)) {
      delete body.response_format;
      res = await fetch(lmEndpoint(baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify(body),
      });
    }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`LM Studio ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("LM Studio returned empty content");
  return content;
}

function parseStructuredContent(content: string): StructuredLabel {
  const jsonStr = extractJsonObject(content);
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  return normalizeStructuredLabel(parsed);
}

export async function structureLabelFromText(
  rawText: string,
  opts: LmStudioOptions = {},
): Promise<{ structured: StructuredLabel; rawResponse: string }> {
  const baseUrl = opts.baseUrl ?? process.env.LM_STUDIO_BASE_URL ?? DEFAULT_BASE;
  const model = opts.model ?? process.env.LM_STUDIO_MODEL ?? DEFAULT_MODEL;
  const temperature = opts.temperature ?? 0;
  const maxTokens = opts.maxTokens ?? 512;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const payloadText = buildLmStructureUserPayload(rawText);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await withLmStudioLock(async () => {
      let content = await callLm(
        baseUrl,
        model,
        temperature,
        maxTokens,
        controller.signal,
        payloadText,
        true,
      );

      try {
        return { structured: parseStructuredContent(content), rawResponse: content };
      } catch {
        content = await callLm(
          baseUrl,
          model,
          temperature,
          maxTokens,
          controller.signal,
          payloadText + LM_RETRY_SUFFIX,
          true,
        );
        return { structured: parseStructuredContent(content), rawResponse: content };
      }
    }, { label: "ocr:structure" });
  } finally {
    clearTimeout(timer);
  }
}

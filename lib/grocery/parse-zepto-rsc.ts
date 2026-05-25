/**
 * Zepto PDP embeds full ingredients + nutrition in Next.js RSC flight payloads
 * (`self.__next_f.push`), not in product-assortment-service product-detail JSON.
 */
import { isPlausibleIngredientsList } from "@/lib/nutrition/completeness";
import { parseServingNutritionBlock } from "./parse-nutrition-block";
import type { ProductNutrition } from "@/lib/supabase/types";

/** Decode escaped RSC flight chunks from PDP HTML. */
export function decodeZeptoRscChunks(html: string): string {
  const parts: string[] = [];
  const re = /self\.__next_f\.push\(\[1,"((?:\\.|[^"])*)"\]\)/g;
  for (const m of html.matchAll(re)) {
    try {
      parts.push(JSON.parse(`"${m[1]}"`) as string);
    } catch {
      // skip malformed chunk
    }
  }
  return parts.join("");
}

/** Extract {"key":"…","value":"…"} rows from RSC text (product detail section). */
export function extractZeptoRscAttributes(html: string): Record<string, string> {
  const blob = decodeZeptoRscChunks(html);
  const attrs: Record<string, string> = {};
  const re = /\{"key":"((?:\\.|[^"\\])*)","value":"((?:\\.|[^"\\])*)"\}/g;
  for (const m of blob.matchAll(re)) {
    const key = JSON.parse(`"${m[1]}"`) as string;
    const value = JSON.parse(`"${m[2]}"`) as string;
    if (key && value?.trim()) attrs[key] = value.trim();
  }
  return attrs;
}

/** Parse Zepto RSC "nutrition information" one-liner (comma-separated). */
export function parseZeptoRscNutritionLine(text: string): ProductNutrition | null {
  if (!text?.trim()) return null;

  const canonical: Record<string, number> = {};
  const segments = text.split(/,(?=\s*[A-Za-z])/);

  for (const seg of segments) {
    const trimmed = seg.trim();
    const m =
      /^(.+?)\s+([-+]?\d+(?:\.\d+)?|TRACE|trace)\s*(?:\(([^)]*)\))?/i.exec(trimmed) ??
      /^(.+?)\s*\(([^)]+)\)\s+([-+]?\d+(?:\.\d+)?|TRACE|trace)/i.exec(trimmed);
    if (!m) continue;

    let label: string;
    let valueRaw: string;
    if (m.length === 4 && /kcal|protein|carb|fat|sugar|sodium|fibre|fiber|vitamin|zinc/i.test(m[1])) {
      label = m[1].trim();
      valueRaw = m[2].trim();
    } else if (m[2] && /trace/i.test(m[2])) {
      label = m[1].trim();
      valueRaw = "0";
    } else {
      label = (m[1] ?? m[2] ?? "").trim();
      valueRaw = (m[2] ?? m[3] ?? "").trim();
    }

    const lower = label.toLowerCase();
    const numM = /([-+]?\d+(?:\.\d+)?)/i.exec(valueRaw.replace(/trace/i, "0"));
    if (!numM) continue;
    const v = Number.parseFloat(numM[1]);

    if (/^energy|calorie|kcal/.test(lower)) canonical.energy_kcal_100g = v;
    else if (/protein/.test(lower)) canonical.protein_g_100g = v;
    else if (/added sugar/.test(lower)) canonical.added_sugar_g_100g = v;
    else if (/total sugar/.test(lower)) canonical.sugar_g_100g = v;
    else if (/carbohydrate/.test(lower)) canonical.carbs_g_100g = v;
    else if (/dietary fibre|dietary fiber|fibre|fiber/.test(lower)) canonical.fiber_g_100g = v;
    else if (/trans fat/.test(lower)) canonical.trans_fat_g_100g = v;
    else if (/saturated fat/.test(lower)) canonical.saturated_fat_g_100g = v;
    else if (/total fat/.test(lower)) canonical.fat_g_100g = v;
    else if (/cholesterol/.test(lower)) {
      /* optional extra */
    } else if (/sodium/.test(lower)) canonical.sodium_mg_100g = v;
  }

  if (Object.keys(canonical).length === 0) {
    return parseServingNutritionBlock(text.replace(/,/g, "\n"));
  }
  return { source: "platform", ...canonical };
}

export function mergeRscIntoZeptoFields(opts: {
  html: string;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  attributes: Record<string, string>;
}): {
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  attributes: Record<string, string>;
} {
  const rsc = extractZeptoRscAttributes(opts.html);
  const attributes = { ...opts.attributes, ...rsc };

  let ingredients_raw = opts.ingredients_raw;
  const rscIng =
    rsc.ingredients ?? rsc.Ingredients ?? attributes.ingredients ?? attributes.Ingredients;
  if (rscIng && isPlausibleIngredientsList(rscIng)) {
    ingredients_raw = rscIng;
  } else if (!isPlausibleIngredientsList(ingredients_raw) && rscIng) {
    ingredients_raw = rscIng;
  }

  let nutrition = opts.nutrition;
  const nutText =
    rsc["nutrition information"] ??
    rsc["Nutrition Information"] ??
    rsc["nutritional information"];
  if (nutText) {
    const parsed = parseZeptoRscNutritionLine(nutText);
    if (parsed) nutrition = { ...nutrition, ...parsed, source: "platform" };
  }

  return { ingredients_raw, nutrition, attributes };
}

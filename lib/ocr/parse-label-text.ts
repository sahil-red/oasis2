/**
 * Parse validated OCR text into structured OcrPayload (ingredients + nutrition).
 * Shared by the PaddleOCR pipeline bridge.
 */

import type { OcrIngredient, OcrNutrition, OcrPayload } from "./types";

export function parseLabelTextToPayload(
  text: string,
  opts: {
    avgConfidence?: number;
    rawText?: string;
    backend?: OcrPayload["backend"];
    backendNote?: string;
  } = {},
): OcrPayload {
  const ingredients = extractIngredients(text);
  const { per100g, perServe } = extractNutrition(text);
  const serving_size = extractServingSize(text);
  const net_weight = extractNetWeight(text);
  const allergens = extractAllergens(text);
  const fssai_license = extractFssai(text);
  const origin = extractOrigin(text);

  const hasIngredients = ingredients.length >= 2;
  const hasNutrition = !!(per100g && Object.keys(per100g).length >= 2);
  const confBase = opts.avgConfidence ?? 0.65;
  const overall =
    confBase * 0.4 + (hasIngredients ? 0.3 : 0) + (hasNutrition ? 0.3 : 0);

  return {
    ingredients,
    nutrition_per_100g: per100g,
    nutrition_per_serve: perServe,
    serving_size,
    net_weight,
    allergens,
    fssai_license,
    origin,
    labels: [],
    confidence: {
      overall: Math.min(1, overall),
      has_ingredients: hasIngredients,
      has_nutrition_table: hasNutrition,
      notes: opts.backendNote ?? `ocr avg_conf=${confBase.toFixed(2)}`,
    },
    backend: opts.backend ?? "paddle",
    raw_text: opts.rawText ?? text,
  };
}

function extractIngredients(text: string): OcrIngredient[] {
  const re =
    /Ingredients?\s*:?\s*([\s\S]*?)(?=\b(?:ALLERGEN|CONTAINS|NUTRITION|NUTRITIONAL|BEST\s+BEFORE|STORAGE|MFG|MFD|MANUFACTURED|FSSAI|NET\s+WEIGHT|NET\s+QUANTITY)\b|$)/i;
  const m = re.exec(text);
  if (!m) return [];
  const block = m[1]
    .replace(/\s+/g, " ")
    .replace(/[.;]+$/, "")
    .trim();
  if (!block) return [];

  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of block) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(buf.trim());
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());

  return parts
    .filter((p) => p.length > 1 && p.length < 200)
    .map((p) => {
      const ing: OcrIngredient = { name: p };
      const pct = /\(?\s*(\d{1,2}(?:\.\d+)?)\s*%\s*\)?/.exec(p);
      if (pct) {
        ing.percent = Number(pct[1]);
        ing.name = p.replace(pct[0], "").trim();
      }
      const parens = /\(([^)]+)\)/.exec(ing.name);
      if (parens) {
        const subs = parens[1]
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 1 && !/^\d/.test(s));
        if (subs.length) ing.sub_ingredients = subs;
        ing.name = ing.name.replace(parens[0], "").trim();
      }
      return ing;
    });
}

const NUTRIENT_KEYS: Array<[RegExp, keyof OcrNutrition]> = [
  [/energy(?:\s*\(kcal\))?/i, "energy_kcal"],
  [/protein/i, "protein_g"],
  [/total\s*fat|^fat\b/i, "fat_g"],
  [/saturated\s*fat|sat(?:urated)?\s*fat/i, "saturated_fat_g"],
  [/trans\s*fat/i, "trans_fat_g"],
  [/(?:total\s*)?carbohydrate|carbs/i, "carbs_g"],
  [/(?:total\s*)?sugar(?!\s*alcohol)/i, "sugar_g"],
  [/added\s*sugar/i, "added_sugar_g"],
  [/(?:dietary\s*)?fib(?:re|er)/i, "fiber_g"],
  [/sodium/i, "sodium_mg"],
  [/calcium/i, "calcium_mg"],
  [/iron/i, "iron_mg"],
  [/cholesterol/i, "cholesterol_mg"],
];

function extractNutrition(
  text: string,
): { per100g?: OcrNutrition; perServe?: OcrNutrition } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const per100g: OcrNutrition = {};
  const perServe: OcrNutrition = {};

  let seenHeader = false;
  let columns: "single" | "per100_first" | "perserve_first" = "single";
  for (const line of lines) {
    if (/nutrition(?:al)?\s+information/i.test(line)) {
      seenHeader = true;
      const idx100 = line.toLowerCase().indexOf("per 100");
      const idxServe = line.toLowerCase().indexOf("per serv");
      if (idx100 !== -1 && idxServe !== -1) {
        columns = idx100 < idxServe ? "per100_first" : "perserve_first";
      }
      continue;
    }
    if (!seenHeader) continue;

    for (const [re, key] of NUTRIENT_KEYS) {
      if (!re.test(line)) continue;
      const nums = [...line.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      if (nums.length === 0) break;

      if (columns === "perserve_first" && nums.length >= 2) {
        perServe[key] = nums[0];
        per100g[key] = nums[1];
      } else if (columns === "per100_first" && nums.length >= 2) {
        per100g[key] = nums[0];
        perServe[key] = nums[1];
      } else {
        per100g[key] = nums[0];
      }
      break;
    }
  }

  return {
    per100g: Object.keys(per100g).length ? per100g : undefined,
    perServe: Object.keys(perServe).length ? perServe : undefined,
  };
}

function extractServingSize(text: string): string | undefined {
  const m =
    /serv(?:ing)?\s*size\s*[:\-]?\s*([\d.]+\s*(?:g|ml|kg|l|piece|pcs|nos|biscuits?))/i.exec(
      text,
    );
  return m?.[1].replace(/\s+/g, " ").trim();
}

function extractNetWeight(text: string): string | undefined {
  const m =
    /net\s*(?:weight|qty|quantity|wt)\s*[:\-]?\s*([\d.]+\s*(?:g|ml|kg|l))/i.exec(
      text,
    );
  return m?.[1].replace(/\s+/g, " ").trim();
}

function extractAllergens(text: string): string[] {
  const m =
    /(?:contains|allergen[s]?\s*(?:information|advice)?)\s*:?\s*([^.\n]+)/i.exec(
      text,
    );
  if (!m) return [];
  return m[1]
    .split(/,|\sand\s|;/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 1 && s.length < 40);
}

function extractFssai(text: string): string | undefined {
  const m = /\b(\d{14})\b/.exec(text);
  return m?.[1];
}

function extractOrigin(text: string): string | undefined {
  const m = /(?:country\s+of\s+origin|made\s+in)\s*:?\s*([A-Za-z ]{3,30})/i.exec(
    text,
  );
  return m?.[1].trim();
}

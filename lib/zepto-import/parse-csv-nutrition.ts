import {
  nutrientFieldFromLabel,
  parseNutrientAmount,
  parseServingNutritionBlock,
} from "@/lib/grocery/parse-nutrition-block";
import { parseZeptoRscNutritionLine } from "@/lib/grocery/parse-zepto-rsc";
import type { ProductNutrition } from "@/lib/supabase/types";

export function isNullCsvCell(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return true;
  const t = raw.trim().toLowerCase();
  return t === "null" || t === "na" || t === "n/a" || t === "-";
}

/** Karachi-style: "Calories 542Sodium 0 MgTotal Fat 30 G..." */
export function looksLikeInlineNutritionFacts(text: string): boolean {
  return /calories?\s*\d|energy\s*\(?\s*kcal|total\s*fat\s*\d|protein\s*\d+\s*g/i.test(text);
}

function normalizeInlineFacts(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(\d)\s*([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])\s*(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function parseInlineNutritionFacts(text: string): ProductNutrition | null {
  const s = normalizeInlineFacts(text);
  const canonical: Record<string, number> = {};

  const rules: Array<[RegExp, keyof typeof canonical]> = [
    [/calories?\s*(\d+(?:\.\d+)?)/i, "energy_kcal_100g"],
    [/energy\s*\(?\s*kcal\s*\)?\s*(\d+(?:\.\d+)?)/i, "energy_kcal_100g"],
    [/protein\s*(\d+(?:\.\d+)?)\s*g/i, "protein_g_100g"],
    [/(?:total\s*)?carb(?:ohydrate)?s?\s*(\d+(?:\.\d+)?)\s*g/i, "carbs_g_100g"],
    [/(?:total\s*)?fat\s*(\d+(?:\.\d+)?)\s*g/i, "fat_g_100g"],
    [/sugars?\s*(\d+(?:\.\d+)?)\s*g/i, "sugar_g_100g"],
    [/dietary\s*fib(?:er|re)\s*(\d+(?:\.\d+)?)\s*g/i, "fiber_g_100g"],
    [/sodium\s*(\d+(?:\.\d+)?)\s*mg/i, "sodium_mg_100g"],
  ];

  for (const [re, key] of rules) {
    const m = re.exec(s);
    if (m) canonical[key] = Number.parseFloat(m[1]);
  }

  return Object.keys(canonical).length >= 3
    ? { source: "platform", ...canonical }
    : null;
}

/** Prose: "590 cal, 50 gm of fat, 24 gm of protein, and 20 gm of carbohydrates per 100 gm" */
function parseProseNutrition(text: string): ProductNutrition | null {
  const canonical: Record<string, number> = {};
  const rules: Array<[RegExp, keyof typeof canonical]> = [
    [/(\d+(?:\.\d+)?)\s*(?:kcal|cal(?:ories)?)\b/i, "energy_kcal_100g"],
    [/(\d+(?:\.\d+)?)\s*gm?\s+of\s+protein/i, "protein_g_100g"],
    [/(\d+(?:\.\d+)?)\s*gm?\s+of\s+fat/i, "fat_g_100g"],
    [/(\d+(?:\.\d+)?)\s*gm?\s+of\s+carbohydrates/i, "carbs_g_100g"],
    [/approximately\s+(\d+(?:\.\d+)?)\s+calories/i, "energy_kcal_100g"],
  ];
  for (const [re, key] of rules) {
    const m = re.exec(text);
    if (m) canonical[key] = Number.parseFloat(m[1]);
  }
  return Object.keys(canonical).length >= 3
    ? { source: "platform", ...canonical }
    : null;
}

/** Per-serving table: "Per Serving Per 100gm ... Protein(g) 31.81 ..." */
function parsePerServingTable(text: string): ProductNutrition | null {
  if (!/per\s*(?:100|serving)/i.test(text)) return null;
  const canonical: Record<string, number> = {};
  const per100 = /per\s*100\s*g?m/i.test(text);
  const re =
    /([A-Za-z][A-Za-z\s/()-]{1,40}?)\s*\(?\s*(?:g|mg|kcal)?\s*\)?\s*([-+]?\d+(?:\.\d+)?|<\s*\d+(?:\.\d+)?)/gi;
  for (const m of text.matchAll(re)) {
    const label = m[1].trim();
    if (/per\s|serve|rda|%/i.test(label)) continue;
    const value = parseNutrientAmount(m[2]);
    if (value == null) continue;
    const field = nutrientFieldFromLabel(label);
    if (field) canonical[field] = value;
  }
  if (Object.keys(canonical).length < 3) return null;
  if (!per100) {
    // Scale to per 100g when block is per-serving only (assume 100g if unspecified).
    return { source: "platform", ...canonical };
  }
  return { source: "platform", ...canonical };
}

/** Parse nutrition from a CSV cell (JSON, RSC one-liner, multiline, or inline facts blob). */
export function parseCsvNutritionCell(raw: string | null | undefined): ProductNutrition | null {
  if (isNullCsvCell(raw) || raw == null) return null;
  const text = raw.trim();

  if (text.startsWith("{")) {
    try {
      const o = JSON.parse(text) as Record<string, unknown>;
      const n: ProductNutrition = { source: "platform" };
      const map: Array<[string, keyof ProductNutrition]> = [
        ["energy_kcal_100g", "energy_kcal_100g"],
        ["energy_kcal", "energy_kcal_100g"],
        ["protein_g_100g", "protein_g_100g"],
        ["protein_g", "protein_g_100g"],
        ["fat_g_100g", "fat_g_100g"],
        ["carbs_g_100g", "carbs_g_100g"],
        ["carbohydrates_g", "carbs_g_100g"],
        ["sugar_g_100g", "sugar_g_100g"],
        ["added_sugar_g_100g", "added_sugar_g_100g"],
        ["fiber_g_100g", "fiber_g_100g"],
        ["sodium_mg_100g", "sodium_mg_100g"],
      ];
      let any = false;
      for (const [from, to] of map) {
        const v = o[from];
        if (typeof v === "number" && Number.isFinite(v)) {
          (n as Record<string, number>)[to] = v;
          any = true;
        }
      }
      return any ? n : null;
    } catch {
      // fall through
    }
  }

  const rsc = parseZeptoRscNutritionLine(text);
  if (rsc && Object.keys(rsc).length > 2) return rsc;

  const semicolonBlock = parseServingNutritionBlock(text.replace(/;/g, "\n").replace(/,/g, "\n"));
  if (semicolonBlock) {
    return rsc
      ? { ...semicolonBlock, ...rsc, source: "platform" }
      : { ...semicolonBlock, source: "platform" };
  }

  const inline = parseInlineNutritionFacts(text);
  if (inline) {
    return rsc ? { ...inline, ...rsc, source: "platform" } : inline;
  }

  const prose = parseProseNutrition(text);
  if (prose) return prose;

  const table = parsePerServingTable(text);
  if (table) return table;

  const block = parseServingNutritionBlock(text.replace(/,/g, "\n"));
  if (block) {
    return rsc
      ? { ...block, ...rsc, source: "platform" }
      : { ...block, source: "platform" };
  }

  return rsc;
}

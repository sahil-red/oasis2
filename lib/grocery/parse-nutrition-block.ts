import type { ProductNutrition } from "@/lib/supabase/types";

/** Same mapping order as blinkit.ts — specific patterns before generic. */
const LINE_PATTERNS: Array<[RegExp, string, (v: number, unit: string) => number]> = [
  [/added sugar/i, "added_sugar_g_100g", (v, u) => scaleMass(v, u)],
  [/total sugars?|^sugars?/i, "sugar_g_100g", (v, u) => scaleMass(v, u)],
  [/total carbohydrates?|^carbohydrates?|^carbs$/i, "carbs_g_100g", (v, u) => scaleMass(v, u)],
  [/dietary fibre|dietary fiber|^fibre|^fiber/i, "fiber_g_100g", (v, u) => scaleMass(v, u)],
  [/trans ?fat/i, "trans_fat_g_100g", (v, u) => scaleMass(v, u)],
  [/saturated fat/i, "saturated_fat_g_100g", (v, u) => scaleMass(v, u)],
  [/total fat|^fat$/i, "fat_g_100g", (v, u) => scaleMass(v, u)],
  [/protein/i, "protein_g_100g", (v, u) => scaleMass(v, u)],
  [/sodium/i, "sodium_mg_100g", (v, u) => scaleSodium(v, u)],
  [/energy|calories?|kcal/i, "energy_kcal_100g", (v) => v],
];

function scaleMass(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === "mg") return value / 1000;
  return value;
}

function scaleSodium(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u === "g") return value * 1000;
  return value;
}

function parseLineValue(raw: string): { value: number; unit: string } | null {
  const cleaned = raw.replace(/\([^)]*\)/g, "").trim();
  const m = /([-+]?\d+(?:\.\d+)?)\s*(kcal|mg|g)?/i.exec(cleaned);
  if (!m) return null;
  return {
    value: Number.parseFloat(m[1]),
    unit: (m[2] ?? "g").toLowerCase(),
  };
}

/**
 * Blinkit often puts the full FSSAI table in a "Nutrition Information" attribute
 * as multiline per-serving text, while headline rows only list protein/kcal per 100g.
 */
export function parseServingNutritionBlock(text: string): ProductNutrition | null {
  if (!text?.trim()) return null;

  const header = text.split(/\n/)[0] ?? "";
  const serveMatch = /per\s*(\d+(?:\.\d+)?)\s*g/i.exec(header) ?? /per\s*(\d+(?:\.\d+)?)\s*g/i.exec(text);
  const servingG = serveMatch ? Number.parseFloat(serveMatch[1]) : null;
  const toPer100 =
    servingG != null && servingG > 0 && servingG !== 100 ? 100 / servingG : 1;

  const canonical: Record<string, number> = {};
  const extra: Record<string, number | string> = {};

  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed || /^per\s*\d/i.test(trimmed)) continue;

    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;

    const label = trimmed.slice(0, colon).trim();
    const valueRaw = trimmed.slice(colon + 1).trim();
    const parsed = parseLineValue(valueRaw);
    if (!parsed) continue;

    for (const [re, key, transform] of LINE_PATTERNS) {
      if (!re.test(label)) continue;
      let perServe = transform(parsed.value, parsed.unit);
      if (key === "energy_kcal_100g") {
        perServe = parsed.value;
      }
      const per100 = Math.round(perServe * toPer100 * 100) / 100;
      canonical[key] = per100;
      break;
    }

    if (!LINE_PATTERNS.some(([re]) => re.test(label))) {
      extra[label] = parsed.value;
    }
  }

  if (Object.keys(canonical).length === 0) return null;

  const out: ProductNutrition = { source: "platform", ...canonical };
  if (servingG != null) {
    out.extra = {
      ...(out.extra ?? {}),
      serving_size_g: servingG,
      nutrition_basis: `per_${servingG}g_serving_scaled_to_100g`,
    };
  }
  if (Object.keys(extra).length > 0) {
    out.extra = { ...(out.extra ?? {}), ...extra };
  }
  return out;
}

const CANONICAL_KEYS = [
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
] as const;

/** Merge serving-block data; explicit per-100g row values win on conflict. */
export function mergeNutrition(
  primary: ProductNutrition | null,
  fromBlock: ProductNutrition | null,
): ProductNutrition | null {
  if (!primary && !fromBlock) return null;
  if (!primary) return fromBlock;
  if (!fromBlock) return primary;

  const merged: ProductNutrition = {
    source: primary.source ?? fromBlock.source ?? "platform",
    extra: { ...(fromBlock.extra ?? {}), ...(primary.extra ?? {}) },
  };

  for (const key of CANONICAL_KEYS) {
    const p = primary[key];
    const b = fromBlock[key];
    if (p != null && Number.isFinite(p)) merged[key] = p;
    else if (b != null && Number.isFinite(b)) merged[key] = b;
  }

  if (Object.keys(merged).length <= 2 && !merged.protein_g_100g && !merged.energy_kcal_100g) {
    return primary;
  }
  return merged;
}

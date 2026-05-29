import type { ProductNutrition } from "@/lib/supabase/types";

const NUTRIENT_FIELD_KEYS = [
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

export type CanonicalNutrientField = (typeof NUTRIENT_FIELD_KEYS)[number];

/** Map a label like "Fat (g)" or "Total Carbohydrates" to a canonical nutrition field. */
export function nutrientFieldFromLabel(label: string): CanonicalNutrientField | null {
  const lower = label
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (/added\s*sugar/.test(lower)) return "added_sugar_g_100g";
  if (/total\s*sugars?|^sugars?$/.test(lower)) return "sugar_g_100g";
  if (/^sugar\b/.test(lower)) return "sugar_g_100g";
  if (/total\s*carb|carbohydrate|^carbs?$/.test(lower)) return "carbs_g_100g";
  if (/dietary\s*fib|^fib(?:er|re)?$/.test(lower)) return "fiber_g_100g";
  if (/trans\s*fat/.test(lower)) return "trans_fat_g_100g";
  if (/saturated\s*fat/.test(lower)) return "saturated_fat_g_100g";
  if (/total\s*fat|^fat$/.test(lower)) return "fat_g_100g";
  if (/^fat\b/.test(lower)) return "fat_g_100g";
  if (/protein/.test(lower)) return "protein_g_100g";
  if (/sodium/.test(lower)) return "sodium_mg_100g";
  if (/energy|calorie|kcal/.test(lower)) return "energy_kcal_100g";
  return null;
}

/** Parse "<0.5", "TRACE", "938.80 k cal" style values. */
export function parseNutrientAmount(raw: string): number | null {
  const cleaned = raw.replace(/trace/gi, "0").trim();
  const m = /<?(\d+(?:\.\d+)?)/.exec(cleaned);
  if (!m) return null;
  const n = Number.parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

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
  const m = /<?(\d+(?:\.\d+)?)\s*(kcal|mg|g)?/i.exec(cleaned.replace(/trace/gi, "0"));
  if (!m) return null;
  return {
    value: Number.parseFloat(m[1]),
    unit: (m[2] ?? "g").toLowerCase(),
  };
}

/**
 * Blinkit often puts the full FSSAI table in a "Nutrition Information" attribute
 * as multiline per-serving text, while headline rows only list protein/kcal per 100g.
 *
 * When no "per X g" header exists, values are assumed **per 100g** (Zepto default).
 * Do not pass pack net weight as a serving fallback — it wrongly scales per-100g tables.
 */
export function parseServingNutritionBlock(
  text: string,
  fallbackServingG?: number,
): ProductNutrition | null {
  if (!text?.trim()) return null;

  const header = text.split(/\n/)[0] ?? "";
  const serveMatch =
    /per\s*(\d+(?:\.\d+)?)\s*g/i.exec(header) ?? /per\s*(\d+(?:\.\d+)?)\s*g/i.exec(text);
  let servingG = serveMatch ? Number.parseFloat(serveMatch[1]) : null;

  if (servingG == null && /per\s*100(?:\.\d+)?\s*g?m?\b/i.test(text)) {
    servingG = 100;
  }

  // Only use explicit small serving hints — never whole pack weight.
  if (
    (servingG == null || servingG <= 0) &&
    fallbackServingG != null &&
    fallbackServingG > 0 &&
    fallbackServingG <= 100
  ) {
    servingG = fallbackServingG;
  }

  const toPer100 =
    servingG != null && servingG > 0 && servingG !== 100 ? 100 / servingG : 1;

  const canonical: Record<string, number> = {};
  const extra: Record<string, number | string> = {};

  for (const line of text.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed || /^per\s*\d/i.test(trimmed)) continue;

    let label: string;
    let valueRaw: string;

    const colon = trimmed.indexOf(":");
    if (colon >= 0) {
      label = trimmed.slice(0, colon).trim();
      valueRaw = trimmed.slice(colon + 1).trim();
    } else {
      const tab = trimmed.split(/\t+/);
      if (tab.length >= 2) {
        label = tab[0].trim();
        valueRaw = tab.slice(1).join(" ").trim();
      } else {
        const parts = trimmed.match(/^(.+?)\s+([-+]?\d+(?:\.\d+)?(?:\s*(?:kcal|mg|g))?)\s*$/i);
        if (!parts) continue;
        label = parts[1].trim();
        valueRaw = parts[2].trim();
      }
    }

    const parsed = parseLineValue(valueRaw);
    if (!parsed) continue;
    const unitFromLabel = /\(\s*mg\s*\)/i.test(label)
      ? "mg"
      : /\(\s*g\s*\)/i.test(label) && !/kcal/i.test(label)
        ? "g"
        : /\(\s*kcal\s*\)/i.test(label)
          ? "kcal"
          : parsed.unit;

    const mapped = nutrientFieldFromLabel(label);
    if (mapped) {
      let perServe = parsed.value;
      if (mapped !== "energy_kcal_100g") {
        perServe =
          mapped === "sodium_mg_100g"
            ? scaleSodium(parsed.value, unitFromLabel)
            : scaleMass(parsed.value, unitFromLabel);
      }
      const per100 = Math.round(perServe * toPer100 * 100) / 100;
      canonical[mapped] = per100;
    } else {
      let matched = false;
      for (const [re, key, transform] of LINE_PATTERNS) {
        if (!re.test(label)) continue;
        let perServe = transform(parsed.value, unitFromLabel);
        if (key === "energy_kcal_100g") {
          perServe = parsed.value;
        }
        const per100 = Math.round(perServe * toPer100 * 100) / 100;
        canonical[key] = per100;
        matched = true;
        break;
      }
      if (!matched) {
        extra[label] = parsed.value;
      }
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

/** Fill only missing canonical fields from a fallback (e.g. reference paneer for sparse OCR). */
export function fillMissingNutritionFields(
  primary: ProductNutrition,
  fallback: ProductNutrition,
): ProductNutrition {
  const merged: ProductNutrition = {
    source: primary.source ?? fallback.source ?? "platform",
    extra: { ...(fallback.extra ?? {}), ...(primary.extra ?? {}) },
  };
  for (const key of CANONICAL_KEYS) {
    const p = primary[key];
    const b = fallback[key];
    if (p != null && Number.isFinite(p)) merged[key] = p;
    else if (b != null && Number.isFinite(b)) merged[key] = b;
  }
  return merged;
}

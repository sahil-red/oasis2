import baselinesJson from "@/data/category-baselines.json";
import type { ProductNutrition } from "@/lib/supabase/types";

interface BaselineEntry {
  floor: number;
  ceiling: number;
  nutrients: Record<string, number>;
  source?: string;
}

interface BaselinesFile {
  _default: BaselineEntry;
  baselines: Record<string, BaselineEntry>;
}

const FILE = baselinesJson as BaselinesFile;

/** Per-category nutrient ceilings (not global meat-scale caps). */
const BASELINE_CEILINGS: Record<string, Partial<Record<keyof ProductNutrition | string, number>>> = {
  "Dairy & Eggs::Milk": {
    protein_g_100g: 5,
    sugar_g_100g: 12,
    added_sugar_g_100g: 8,
    saturated_fat_g_100g: 6,
    energy_kcal_100g: 100,
  },
  "Dairy & Eggs::Curd & Yogurt": {
    protein_g_100g: 6,
    sugar_g_100g: 14,
    added_sugar_g_100g: 12,
    saturated_fat_g_100g: 8,
    energy_kcal_100g: 120,
  },
  "Soft Drinks & Juices::Carbonated Drinks": {
    protein_g_100g: 2,
    sugar_g_100g: 12,
    added_sugar_g_100g: 12,
    energy_kcal_100g: 55,
    sodium_mg_100g: 120,
  },
  "Soft Drinks & Juices::Packaged Fruit Juices": {
    protein_g_100g: 2,
    sugar_g_100g: 14,
    added_sugar_g_100g: 14,
    energy_kcal_100g: 65,
  },
};

const GLOBAL_CEILINGS: Record<string, number> = {
  protein_g_100g: 35,
  fat_g_100g: 50,
  saturated_fat_g_100g: 25,
  trans_fat_g_100g: 2,
  carbs_g_100g: 80,
  sugar_g_100g: 40,
  added_sugar_g_100g: 30,
  fiber_g_100g: 15,
  sodium_mg_100g: 1500,
  energy_kcal_100g: 600,
};

function isChocolateMilk(name: string): boolean {
  return /chocolate|cadbury|kitkat|kinder|milkybar|munch/i.test(name);
}

function isFreshMilk(name: string): boolean {
  return /milk|doodh/i.test(name) && !isChocolateMilk(name);
}

/** Resolve which baseline row applies (Blinkit taxonomy + product name). */
export function resolveBaselineKey(
  category: string | null,
  subcategory: string | null,
  productName?: string | null,
): string {
  const name = (productName ?? "").toLowerCase();
  const cat = category ?? "";
  const sub = (subcategory ?? "").toLowerCase();
  const map = FILE.baselines;

  if (cat === "Dairy, Bread & Eggs") {
    if (isFreshMilk(name) || /milk/i.test(sub)) return "Dairy & Eggs::Milk";
    if (/curd|yogurt|dahi/i.test(name) || /curd|yogurt/i.test(sub)) return "Dairy & Eggs::Curd & Yogurt";
    if (/bread|pav|bun/i.test(name)) return "Breads & Buns::Pav & White Bread";
  }

  if (cat === "Cold Drinks & Juices") {
    if (/juice|nimbooz/i.test(name) || /juice/i.test(sub)) {
      return "Soft Drinks & Juices::Packaged Fruit Juices";
    }
    return "Soft Drinks & Juices::Carbonated Drinks";
  }

  if (cat && sub) {
    const exact = `${cat}::${sub}`;
    if (map[exact]) return exact;
  }

  if (category && subcategory) {
    const zeptoExact = `${category}::${subcategory}`;
    if (map[zeptoExact]) return zeptoExact;
  }

  if (category) {
    const prefix = Object.keys(map).find((k) => k.startsWith(`${category}::`));
    if (prefix) return prefix;
    if (map[category]) return category;
    const fuzzy = Object.keys(map).find((k) =>
      k.toLowerCase().includes(category.toLowerCase()),
    );
    if (fuzzy) return fuzzy;
  }

  return "_default";
}

export function resolveBaseline(
  category: string | null,
  subcategory: string | null,
  productName?: string | null,
): BaselineEntry {
  const key = resolveBaselineKey(category, subcategory, productName);
  if (key === "_default") return FILE._default;
  return FILE.baselines[key] ?? FILE._default;
}

function nutrientCeiling(baselineKey: string, nutrientKey: string): number {
  return (
    BASELINE_CEILINGS[baselineKey]?.[nutrientKey] ??
    GLOBAL_CEILINGS[nutrientKey] ??
    100
  );
}

function nutrientNorm(
  baselineKey: string,
  key: string,
  value: number,
  weight: number,
): number {
  const ceil = nutrientCeiling(baselineKey, key);
  const ratio = Math.min(1, Math.max(0, value / ceil));
  return weight >= 0 ? ratio : 1 - ratio;
}

function isDietSoftDrink(
  baselineKey: string,
  nutrition: ProductNutrition,
  productName: string,
): boolean {
  if (baselineKey !== "Soft Drinks & Juices::Carbonated Drinks") return false;
  const sugar = nutrition.sugar_g_100g ?? nutrition.added_sugar_g_100g ?? 0;
  const kcal = nutrition.energy_kcal_100g ?? 0;
  const name = productName.toLowerCase();
  return (
    (sugar <= 1 && kcal <= 10) ||
    /zero|diet|no sugar|sugar free|diets?\s*&\s*lights/i.test(name)
  );
}

/** Map per-100g nutrition + category baseline → 0–60 nutrition subscore. */
export function scoreNutrition(
  nutrition: ProductNutrition | null,
  category: string | null,
  subcategory: string | null,
  productName?: string | null,
): number {
  if (!nutrition) return 15;

  const baselineKey = resolveBaselineKey(category, subcategory, productName);
  const baseline = resolveBaseline(category, subcategory, productName);
  const name = productName ?? "";

  let weighted = 0;
  let wSum = 0;

  for (const [key, weight] of Object.entries(baseline.nutrients)) {
    const v = nutrition[key as keyof ProductNutrition];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    weighted += nutrientNorm(baselineKey, key, v, weight) * Math.abs(weight);
    wSum += Math.abs(weight);
  }

  let quality = wSum > 0 ? weighted / wSum : 0.45;

  let sub = Math.round(
    Math.min(60, Math.max(0, ((baseline.floor + quality * (baseline.ceiling - baseline.floor)) / 100) * 60)),
  );

  const sugar = nutrition.sugar_g_100g ?? nutrition.added_sugar_g_100g;
  const sodium = nutrition.sodium_mg_100g;
  const kcal = nutrition.energy_kcal_100g;

  // Absolute sugar caps (any category).
  if (typeof sugar === "number") {
    if (sugar >= 50) sub = Math.min(sub, 12);
    else if (sugar >= 35) sub = Math.min(sub, 18);
    else if (sugar >= 22) sub = Math.min(sub, 28);
  }
  if (typeof sodium === "number" && sodium >= 600) {
    sub = Math.min(sub, sub - 4);
  }

  // Fried snacks / chips — energy-dense; not the same cap as fresh milk.
  if (typeof kcal === "number" && kcal >= 450 && baselineKey !== "Dairy & Eggs::Milk") {
    sub = Math.min(sub, 32);
  }

  // Diet cola: zero sugar ≠ healthy; cap below fresh milk.
  if (isDietSoftDrink(baselineKey, nutrition, name)) {
    sub = Math.min(sub, 22);
  }

  // Sugary soft drinks should not beat plain milk.
  if (baselineKey === "Soft Drinks & Juices::Carbonated Drinks" && typeof sugar === "number" && sugar >= 8) {
    sub = Math.min(sub, 28);
  }

  // Plain milk with modest lactose sugar: floor so it beats soda.
  if (baselineKey === "Dairy & Eggs::Milk" && typeof sugar === "number" && sugar <= 12) {
    sub = Math.max(sub, 38);
  }
  if (baselineKey === "Dairy & Eggs::Milk" && (sugar == null || sugar <= 6) && (kcal ?? 0) < 120) {
    sub = Math.max(sub, 42);
  }

  return Math.max(0, sub);
}

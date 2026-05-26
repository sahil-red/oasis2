import baselinesJson from "@/data/category-baselines.json";
import { matchProduce } from "@/lib/produce/seed";
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
  "Baby & Toddler Food::Baby Cereal": {
    protein_g_100g: 15,
    sugar_g_100g: 8,
    added_sugar_g_100g: 8,
    sodium_mg_100g: 400,
    energy_kcal_100g: 450,
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

function isBabyFoodCategory(
  category: string | null,
  subcategory: string | null,
  productName?: string | null,
): boolean {
  const hay = `${category ?? ""} ${subcategory ?? ""} ${productName ?? ""}`.toLowerCase();
  return /\bbaby\b|\btoddler\b|\binfant\b/.test(hay);
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
    if (/egg|anda|omelette/i.test(name) || /egg/i.test(sub)) return "Dairy & Eggs::Eggs";
    if (isFreshMilk(name) || /milk/i.test(sub)) return "Dairy & Eggs::Milk";
    if (/curd|yogurt|dahi/i.test(name) || /curd|yogurt/i.test(sub)) return "Dairy & Eggs::Curd & Yogurt";
    if (/bread|pav|bun/i.test(name)) return "Breads & Buns::Pav & White Bread";
  }

  if (cat === "Chicken, Meat & Fish" || /chicken|meat|fish|mutton|prawn/i.test(cat)) {
    if (/chicken|drumstick|breast|thigh|wings/i.test(name) || /chicken/i.test(sub)) {
      return "Chicken, Meat & Fish::Chicken";
    }
    if (/fish|rohu|pomfret|salmon/i.test(name) || /fish/i.test(sub)) {
      return "Chicken, Meat & Fish::Fish";
    }
    if (/egg/i.test(name)) return "Dairy & Eggs::Eggs";
  }

  if (/atta|rice|dal|masala|flour|sooji/i.test(cat)) {
    if (/besan|gram flour|chana flour|sattu/i.test(name)) return "Atta, Flours & Sooji::Besan";
    if (/protein powder|whey|isolate|mass gainer|plant protein/i.test(name)) {
      return "Health Supplements::Protein Powder";
    }
  }

  if (/health|supplement|nutrition drink/i.test(cat) || /protein powder|whey/i.test(name)) {
    return "Health Supplements::Protein Powder";
  }

  if (cat === "Cold Drinks & Juices") {
    if (/juice|nimbooz/i.test(name) || /juice/i.test(sub)) {
      return "Soft Drinks & Juices::Packaged Fruit Juices";
    }
    return "Soft Drinks & Juices::Carbonated Drinks";
  }

  if (isBabyFoodCategory(cat, subcategory, productName)) {
    return "Baby & Toddler Food::Baby Cereal";
  }

  // Fresh produce — match by name to decide fruit vs vegetable baseline.
  if (/Fruits?\s*&\s*Vegetables|Fresh\s+Fruits|Fresh\s+Vegetables|Vegetables/i.test(cat)) {
    const entry = matchProduce(productName);
    if (entry) {
      return entry.kind === "fruit"
        ? "Fresh Fruits::All"
        : "Fresh Vegetables::All";
    }
    return "Fresh Vegetables::All";
  }

  // Map Blinkit snack/sweet categories onto our curated baselines so they
  // don't fall back to the lenient _default band.
  if (isSnacksCategory(category)) {
    if (/\b(multigrain|baked|roasted)\b/i.test(name)) {
      return "Chips & Crisps::Baked & Multigrain Chips";
    }
    if (/\b(chip|chips|crisp|crisps|wafer)\b/i.test(name)) {
      return "Chips & Crisps::Potato Chips";
    }
    return "Namkeen & Snacks::Bhujia & Mixtures";
  }

  if (isSweetCategory(category)) {
    if (isHighCacaoChocolate(name)) return "Chocolates & Candies::Dark Chocolate";
    if (/\b(biscuit|cookie|marie|glucose)\b/i.test(name)) {
      return /\b(cream)\b/i.test(name)
        ? "Biscuits & Cookies::Cream Biscuits"
        : "Biscuits & Cookies::Marie & Glucose Biscuits";
    }
    if (/\b(chocolate|kitkat|dairy milk|kinder|munch|milkybar|cadbury)\b/i.test(name)) {
      return "Chocolates & Candies::Milk Chocolate";
    }
    if (/\b(jam|marmalade|preserve)\b/i.test(name)) {
      return "Honey, Spreads & Sauces::Jams & Marmalades";
    }
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

function isProteinSnackName(name: string): boolean {
  return /\b(protein).*\b(chip|chips|crisp|crisps|puff|snack|bar)\b/i.test(name);
}

function isChipOrCrisp(name: string, category: string | null): boolean {
  return /\b(chip|chips|crisp|crisps|wafer|puff|puffs|kurkure|pipes|namkeen|bhujia|cracker)\b/i.test(
    `${name} ${category ?? ""}`,
  );
}

function isHighCacaoChocolate(name: string): boolean {
  if (!name) return false;
  const t = name.toLowerCase();
  if (/\b(cacao|cocoa solids|cocoa mass|dark chocolate)\b/.test(t)) return true;
  if (/\bchocolate\b/.test(t) && /\b(7[0-9]|8[0-9]|9[0-9])\s*%/.test(t)) return true;
  return false;
}

function isSnacksCategory(category: string | null): boolean {
  if (!category) return false;
  return /\b(Snacks|Munchies|Chips|Namkeen|Bhujia|Crackers)\b/i.test(category);
}

function isSweetCategory(category: string | null): boolean {
  if (!category) return false;
  return /\b(Sweet Tooth|Chocolates|Candies|Sweets|Bakery|Dessert)\b/i.test(category);
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
  const saturatedFat = nutrition.saturated_fat_g_100g;
  const transFat = nutrition.trans_fat_g_100g;
  const protein = nutrition.protein_g_100g ?? 0;
  const fiber = nutrition.fiber_g_100g ?? 0;
  const cocoaRich = isHighCacaoChocolate(name);

  // Absolute sugar caps (any category).
  if (typeof sugar === "number") {
    if (sugar >= 50) sub = Math.min(sub, 12);
    else if (sugar >= 35) sub = Math.min(sub, 18);
    else if (sugar >= 22) sub = Math.min(sub, 28);
  }

  if (isBabyFoodCategory(category, subcategory, productName) && typeof sugar === "number") {
    if (sugar >= 12) sub = Math.min(sub, 28);
    else if (sugar >= 8) sub = Math.min(sub, 35);
  }

  // Sodium — these hold across all categories; processed snacks pile on too much
  // salt and we want that to be visible.
  if (typeof sodium === "number") {
    if (sodium >= 1500) sub = Math.min(sub, 10);
    else if (sodium >= 1000) sub = Math.min(sub, 18);
    else if (sodium >= 700) sub = Math.min(sub, 26);
    else if (sodium >= 500) sub = sub - 5;
  }

  // Saturated fat is a real penalty for ordinary processed foods, but cocoa
  // butter is mostly stearic acid with neutral effect on blood lipids — don't
  // crush 99% cacao or unsweetened dark chocolate for it.
  if (typeof saturatedFat === "number" && !cocoaRich) {
    if (saturatedFat >= 18) sub = Math.min(sub, 32);
    else if (saturatedFat >= 10) sub = sub - 5;
  }

  // Any industrially-introduced trans fat is bad news.
  if (typeof transFat === "number" && transFat > 0.05) {
    sub = sub - 8;
  }

  // Fried snacks / chips — energy-dense; not the same cap as fresh milk.
  if (typeof kcal === "number" && kcal >= 450 && baselineKey !== "Dairy & Eggs::Milk") {
    sub = Math.min(sub, 32);
  }

  // Protein-fortified chips/snacks are better than ordinary chips, but not a
  // clean staple. Fibre and real protein can lift them, but keep a ceiling.
  if (isProteinSnackName(name) || isChipOrCrisp(name, category)) {
    const proteinSnackCap = protein >= 25 && fiber >= 5 ? 40 : protein >= 15 ? 36 : 28;
    sub = Math.min(sub, proteinSnackCap);
  }

  // Unsweetened dark chocolate / high-cocoa bars: tighten the floor so they
  // don't get crushed by raw saturated-fat math. Sugar/sodium caps still apply.
  if (cocoaRich && (sugar ?? 99) <= 8 && (nutrition.added_sugar_g_100g ?? 99) <= 3) {
    sub = Math.max(sub, 42);
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

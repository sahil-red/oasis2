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

/** Resolve baseline for a Blinkit category label (best-effort key match). */
export function resolveBaseline(category: string | null, subcategory: string | null): BaselineEntry {
  const map = FILE.baselines;
  if (category && subcategory) {
    const exact = `${category}::${subcategory}`;
    if (map[exact]) return map[exact];
  }
  if (category) {
    const prefix = Object.keys(map).find((k) => k.startsWith(`${category}::`));
    if (prefix) return map[prefix];
    if (map[category]) return map[category];
    // Fuzzy: baseline key contains category name (e.g. "Snacks & Munchies" → chips row).
    const fuzzy = Object.keys(map).find((k) =>
      k.toLowerCase().includes(category.toLowerCase()),
    );
    if (fuzzy) return map[fuzzy];
  }
  return FILE._default;
}

const NUTRIENT_CEILINGS: Record<string, number> = {
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

function nutrientNorm(key: string, value: number, weight: number): number {
  const ceil = NUTRIENT_CEILINGS[key] ?? 100;
  const ratio = Math.min(1, Math.max(0, value / ceil));
  // Positive weight → higher value is better; negative → lower is better.
  return weight >= 0 ? ratio : 1 - ratio;
}

/** Map per-100g nutrition + category baseline → 0–60 nutrition subscore. */
export function scoreNutrition(
  nutrition: ProductNutrition | null,
  category: string | null,
  subcategory: string | null,
): number {
  if (!nutrition) return 15;

  const baseline = resolveBaseline(category, subcategory);
  let weighted = 0;
  let wSum = 0;

  for (const [key, weight] of Object.entries(baseline.nutrients)) {
    const v = nutrition[key as keyof ProductNutrition];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    weighted += nutrientNorm(key, v, weight) * Math.abs(weight);
    wSum += Math.abs(weight);
  }

  let quality = wSum > 0 ? weighted / wSum : 0.5;

  // Sparse labels (e.g. tea with no per-100g table) shouldn't default to "average".
  if (wSum === 0) quality = 0.45;

  let sub = Math.round(
    Math.min(60, Math.max(0, ((baseline.floor + quality * (baseline.ceiling - baseline.floor)) / 100) * 60)),
  );

  // Yuka-style hard signals: ultra-sugary / energy-dense products cap nutrition axis.
  const sugar = nutrition.sugar_g_100g ?? nutrition.added_sugar_g_100g;
  const sodium = nutrition.sodium_mg_100g;
  const kcal = nutrition.energy_kcal_100g;
  if (typeof sugar === "number") {
    if (sugar >= 50) sub = Math.min(sub, 12);
    else if (sugar >= 35) sub = Math.min(sub, 18);
    else if (sugar >= 22) sub = Math.min(sub, 28);
  }
  if (typeof sodium === "number" && sodium >= 600) {
    sub = Math.min(sub, sub - 4);
  }
  if (typeof kcal === "number" && kcal >= 500) {
    sub = Math.min(sub, 32);
  }

  return Math.max(0, sub);
}

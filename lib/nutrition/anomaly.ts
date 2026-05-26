import type { ProductNutrition } from "@/lib/supabase/types";

export type NutritionAnomalyCode =
  | "macro_mass_exceeds_100g"
  | "kcal_mismatch"
  | "category_protein_high"
  | "category_protein_critical"
  | "category_oil_macros"
  | "sugar_exceeds_carbs"
  | "decimal_anomaly"
  | "kcal_protein_swap"
  | "energy_high_low_protein";

export type NutritionAnomaly = {
  code: NutritionAnomalyCode;
  severity: "critical" | "warning";
  message: string;
  field?: keyof ProductNutrition;
};

export type NutritionContext = {
  name: string;
  category?: string | null;
  subcategory?: string | null;
};

const MACRO_KEYS = ["protein_g_100g", "carbs_g_100g", "fat_g_100g"] as const;

function ctxText(ctx: NutritionContext): string {
  return [ctx.name, ctx.category, ctx.subcategory].filter(Boolean).join(" ");
}

function isTeaOrCoffee(ctx: NutritionContext): boolean {
  return /\b(tea|coffee|chai|espresso|latte|herbal)\b/i.test(ctxText(ctx));
}

function isCookingOil(ctx: NutritionContext): boolean {
  return /\b(cooking oil|edible oil|mustard oil|sunflower oil|groundnut oil|olive oil|ghee|refined oil)\b/i.test(
    ctxText(ctx),
  );
}

function macroSum(n: ProductNutrition): number {
  return (n.protein_g_100g ?? 0) + (n.carbs_g_100g ?? 0) + (n.fat_g_100g ?? 0);
}

function impliedKcal(n: ProductNutrition): number | null {
  const p = n.protein_g_100g;
  const c = n.carbs_g_100g;
  const f = n.fat_g_100g;
  if (p == null && c == null && f == null) return null;
  return 4 * (p ?? 0) + 4 * (c ?? 0) + 9 * (f ?? 0);
}

export function kcalMismatchRatio(n: ProductNutrition): number | null {
  const kcal = n.energy_kcal_100g;
  const implied = impliedKcal(n);
  if (kcal == null || implied == null || kcal <= 20) return null;
  return Math.abs(kcal - implied) / kcal;
}

function looksLikeDecimalError(value: number, n: ProductNutrition, ctx: NutritionContext): boolean {
  if (value < 10) return false;
  for (const div of [10, 100]) {
    const scaled = value / div;
    if (scaled <= 0 || scaled >= value) continue;
    const trial = { ...n, protein_g_100g: n.protein_g_100g, carbs_g_100g: n.carbs_g_100g, fat_g_100g: n.fat_g_100g };
    if (n.protein_g_100g === value) trial.protein_g_100g = scaled;
    if (n.carbs_g_100g === value) trial.carbs_g_100g = scaled;
    if (n.fat_g_100g === value) trial.fat_g_100g = scaled;
    const before = kcalMismatchRatio(n);
    const after = kcalMismatchRatio(trial);
    if (after != null && (before == null || after < before * 0.5)) {
      if (isTeaOrCoffee(ctx) && scaled <= 25) return true;
      if (macroSum(trial) <= 100 && scaled <= 90) return true;
    }
  }
  return false;
}

export function detectNutritionAnomalies(
  nutrition: ProductNutrition,
  ctx: NutritionContext,
): NutritionAnomaly[] {
  const out: NutritionAnomaly[] = [];
  const sum = macroSum(nutrition);

  if (sum > 100) {
    out.push({
      code: "macro_mass_exceeds_100g",
      severity: "critical",
      message: `Protein + carbs + fat (${sum.toFixed(1)}g) exceeds 100g per 100g`,
    });
  }

  const mismatch = kcalMismatchRatio(nutrition);
  if (mismatch != null && mismatch > 0.35) {
    out.push({
      code: "kcal_mismatch",
      severity: "critical",
      message: `Energy (${nutrition.energy_kcal_100g} kcal) doesn't match macros (Δ ${(mismatch * 100).toFixed(0)}%)`,
      field: "energy_kcal_100g",
    });
  }

  const protein = nutrition.protein_g_100g;
  if (typeof protein === "number" && isTeaOrCoffee(ctx)) {
    if (protein > 25) {
      out.push({
        code: "category_protein_critical",
        severity: "critical",
        message: `Tea/coffee with ${protein}g protein per 100g is implausible`,
        field: "protein_g_100g",
      });
    } else if (protein > 10) {
      out.push({
        code: "category_protein_high",
        severity: "warning",
        message: `Tea/coffee with ${protein}g protein per 100g is unusually high`,
        field: "protein_g_100g",
      });
    }
  }

  if (isCookingOil(ctx)) {
    const p = nutrition.protein_g_100g ?? 0;
    const c = nutrition.carbs_g_100g ?? 0;
    if (p > 2 || c > 2) {
      out.push({
        code: "category_oil_macros",
        severity: p > 5 || c > 5 ? "critical" : "warning",
        message: `Cooking oil with protein ${p}g / carbs ${c}g per 100g is implausible`,
      });
    }
  }

  const sugar = nutrition.sugar_g_100g;
  const carbs = nutrition.carbs_g_100g;
  if (typeof sugar === "number" && typeof carbs === "number" && sugar > carbs) {
    out.push({
      code: "sugar_exceeds_carbs",
      severity: "warning",
      message: `Sugar (${sugar}g) exceeds total carbs (${carbs}g)`,
      field: "sugar_g_100g",
    });
  }

  if (
    typeof protein === "number" &&
    protein > 15 &&
    typeof nutrition.energy_kcal_100g === "number" &&
    nutrition.energy_kcal_100g > 0 &&
    nutrition.energy_kcal_100g < 30
  ) {
    out.push({
      code: "kcal_protein_swap",
      severity: "critical",
      message: "Protein and energy values may be swapped (OCR/column error)",
    });
  }

  if (
    typeof nutrition.energy_kcal_100g === "number" &&
    nutrition.energy_kcal_100g > 900 &&
    (protein ?? 0) < 5
  ) {
    out.push({
      code: "energy_high_low_protein",
      severity: "critical",
      message: "Very high energy with negligible protein — likely bad parse",
      field: "energy_kcal_100g",
    });
  }

  for (const key of MACRO_KEYS) {
    const v = nutrition[key];
    if (typeof v === "number" && looksLikeDecimalError(v, nutrition, ctx)) {
      out.push({
        code: "decimal_anomaly",
        severity: "warning",
        message: `${key.replace("_g_100g", "")} (${v}g) may be missing a decimal point`,
        field: key,
      });
      break;
    }
  }

  return out;
}

export function nutritionHasCriticalAnomalies(
  nutrition: ProductNutrition | null | undefined,
  ctx: NutritionContext,
): boolean {
  if (!nutrition) return false;
  return detectNutritionAnomalies(nutrition, ctx).some((a) => a.severity === "critical");
}

function scaleMacro(n: ProductNutrition, key: (typeof MACRO_KEYS)[number], factor: number): ProductNutrition {
  const v = n[key];
  if (typeof v !== "number") return n;
  return { ...n, [key]: Math.round(v * factor * 1000) / 1000 };
}

export function tryCorrectNutrition(
  nutrition: ProductNutrition,
  ctx: NutritionContext,
): ProductNutrition | null {
  if (!nutritionHasCriticalAnomalies(nutrition, ctx)) return nutrition;

  const baseMismatch = kcalMismatchRatio(nutrition) ?? 1;
  type Candidate = { n: ProductNutrition; mismatch: number; critical: boolean };
  const candidates: Candidate[] = [];

  const divisors = [1, 0.1, 0.01] as const;
  for (const pDiv of divisors) {
    for (const cDiv of divisors) {
      for (const fDiv of divisors) {
        if (pDiv === 1 && cDiv === 1 && fDiv === 1) continue;
        let trial = nutrition;
        if (pDiv !== 1) trial = scaleMacro(trial, "protein_g_100g", pDiv);
        if (cDiv !== 1) trial = scaleMacro(trial, "carbs_g_100g", cDiv);
        if (fDiv !== 1) trial = scaleMacro(trial, "fat_g_100g", fDiv);
        const critical = nutritionHasCriticalAnomalies(trial, ctx);
        const mismatch = kcalMismatchRatio(trial) ?? 1;
        if (!critical && mismatch <= baseMismatch) {
          candidates.push({ n: trial, mismatch, critical });
        }
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.mismatch - b.mismatch);
  const best = candidates[0].n;
  return {
    ...best,
    extra: {
      ...best.extra,
      nutrition_corrected: "decimal_scale",
    },
  };
}

export function sanitizeNutrition(
  nutrition: ProductNutrition | null | undefined,
  ctx: NutritionContext,
): ProductNutrition | null {
  if (!nutrition) return null;

  const corrected = tryCorrectNutrition(nutrition, ctx) ?? nutrition;
  if (nutritionHasCriticalAnomalies(corrected, ctx)) return null;

  const anomalies = detectNutritionAnomalies(corrected, ctx);
  if (!anomalies.length) return corrected;

  return {
    ...corrected,
    extra: {
      ...corrected.extra,
      nutrition_anomalies: JSON.stringify(anomalies),
    },
  };
}

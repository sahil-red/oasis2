import type { NutritionTier } from "@/lib/search/v2/types";

export function tierFromPercentile(value: number, p33: number, p66: number, invert = false): NutritionTier {
  if (!Number.isFinite(value)) return "unknown";
  const v = invert ? -value : value;
  const a = invert ? -p66 : p33;
  const b = invert ? -p33 : p66;
  if (v <= a) return invert ? "high" : "low";
  if (v >= b) return invert ? "low" : "high";
  return "medium";
}

export function computePercentiles(values: number[]): { p33: number; p66: number } {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { p33: 0, p66: 0 };
  const p33 = sorted[Math.floor(sorted.length * 0.33)] ?? sorted[0]!;
  const p66 = sorted[Math.floor(sorted.length * 0.66)] ?? sorted[sorted.length - 1]!;
  return { p33, p66 };
}

export function assignTiersForType(
  rows: Array<{ sugar_g: number | null; protein_g: number | null; fat_g: number | null }>,
): Array<{ sugar_tier: NutritionTier; protein_tier: NutritionTier; fat_tier: NutritionTier }> {
  const sugars = rows.map((r) => r.sugar_g).filter((v): v is number => v != null);
  const proteins = rows.map((r) => r.protein_g).filter((v): v is number => v != null);
  const fats = rows.map((r) => r.fat_g).filter((v): v is number => v != null);
  const sugarP = computePercentiles(sugars);
  const proteinP = computePercentiles(proteins);
  const fatP = computePercentiles(fats);

  return rows.map((r) => ({
    sugar_tier:
      r.sugar_g == null ? "unknown" : tierFromPercentile(r.sugar_g, sugarP.p33, sugarP.p66, true),
    protein_tier:
      r.protein_g == null ? "unknown" : tierFromPercentile(r.protein_g, proteinP.p33, proteinP.p66),
    fat_tier: r.fat_g == null ? "unknown" : tierFromPercentile(r.fat_g, fatP.p33, fatP.p66, true),
  }));
}

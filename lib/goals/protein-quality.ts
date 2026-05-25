/**
 * Distinguishes protein quantity (g/100g) from protein usefulness for goals.
 * Wheat atta ~11g/100g is real but poor density and incomplete (low lysine).
 */

export type ProteinQualityTier = "complete" | "partial" | "grain" | "supplement" | "negligible";

export type ProteinQualityInsight = {
  tier: ProteinQualityTier;
  proteinPer100Kcal: number;
  label: string;
  shortNote: string;
};

const WHEAT_STAPLE =
  /\b(atta|flour|wheat|maida|sooji|semolina|rava|bread|pav|roti|chapati)\b/i;
const LEGUME =
  /\b(dal|lentil|pulse|besan|gram flour|chana|moong|urad|rajma|soy chunk|soya)\b/i;
const ANIMAL =
  /\b(chicken|egg|paneer|fish|mutton|beef|whey|curd|yogurt|milk powder|meat)\b/i;
const SUPPLEMENT = /\b(whey|protein powder|isolate|mass gainer|plant protein)\b/i;

export function proteinQualityInsight(opts: {
  name?: string | null;
  category?: string | null;
  protein_g_100g?: number | null;
  energy_kcal_100g?: number | null;
}): ProteinQualityInsight | null {
  const protein = opts.protein_g_100g ?? 0;
  const kcal = opts.energy_kcal_100g ?? 0;
  if (protein < 3 || kcal < 30) return null;

  const text = `${opts.name ?? ""} ${opts.category ?? ""}`;
  const proteinPer100Kcal = kcal > 0 ? (protein / kcal) * 100 : 0;

  if (SUPPLEMENT.test(text)) {
    return {
      tier: "supplement",
      proteinPer100Kcal,
      label: "Concentrated protein",
      shortNote: "High-quality, efficient protein",
    };
  }
  if (ANIMAL.test(text) && protein >= 8) {
    return {
      tier: "complete",
      proteinPer100Kcal,
      label: "Complete protein",
      shortNote: "Efficient for muscle & recovery",
    };
  }
  if (LEGUME.test(text) && protein >= 8) {
    return {
      tier: "partial",
      proteinPer100Kcal,
      label: "Plant protein (partial)",
      shortNote: "Good value; combine with grains",
    };
  }
  if (WHEAT_STAPLE.test(text) && protein >= 6) {
    return {
      tier: "grain",
      proteinPer100Kcal,
      label: "Grain protein only",
      shortNote: `${protein.toFixed(0)}g/100g but low quality & density`,
    };
  }
  if (proteinPer100Kcal < 2.5 && protein >= 5) {
    return {
      tier: "grain",
      proteinPer100Kcal,
      label: "Low protein efficiency",
      shortNote: "Lots of calories per gram protein",
    };
  }
  if (proteinPer100Kcal >= 8) {
    return {
      tier: "complete",
      proteinPer100Kcal,
      label: "Protein-dense",
      shortNote: "Strong protein per calorie",
    };
  }
  return null;
}

/**
 * §3a Quantitative traits — deterministic MATH only (percentile within primary_type).
 * Semantic traits come from offline LLM enrichment — no keyword rules.
 */
import type { ProductNutrition } from "@/lib/supabase/types";
import type { TraitConfidenceMap, TraitId, TraitSourceMap, TraitVector } from "@/lib/search/v2/types";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function percentileRank(value: number, cohort: number[], invert = false): number {
  const sorted = cohort.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0.5;
  const below = sorted.filter((v) => v < value).length;
  const raw = below / sorted.length;
  return clamp01(invert ? 1 - raw : raw);
}

const QUANTITATIVE_TRAITS: TraitId[] = [
  "protein_density",
  "fiber_density",
  "low_sugar",
  "low_sodium",
  "low_fat",
  "low_saturated_fat",
  "healthy_fats",
  "low_calorie_density",
  "low_carb",
  "calcium_rich",
  "iron_rich",
  "no_added_sugar",
];

/** Compute math traits for one product given cohort nutrition within its primary_type. */
export function computeQuantitativeTraits(opts: {
  nutrition: ProductNutrition | null;
  has_added_sugar: boolean | null;
  data_quality_score: number;
  cohortByType: Map<
    string,
    Array<{
      sugar_g: number | null;
      protein_g: number | null;
      fat_g: number | null;
      saturated_fat_g: number | null;
      sodium_mg: number | null;
      energy_kcal: number | null;
      fiber_g: number | null;
      calcium_mg: number | null;
      iron_mg: number | null;
      carbs_g: number | null;
    }>
  >;
  primary_type: string;
}): { traits: TraitVector; trait_source: TraitSourceMap; trait_confidence: TraitConfidenceMap } {
  const n = opts.nutrition;
  const traits: TraitVector = {};
  const trait_source: TraitSourceMap = {};
  const trait_confidence: TraitConfidenceMap = {};
  const cohort = opts.cohortByType.get(opts.primary_type) ?? [];

  const sugars = cohort.map((c) => c.sugar_g).filter((v): v is number => v != null);
  const proteins = cohort.map((c) => c.protein_g).filter((v): v is number => v != null);
  const fats = cohort.map((c) => c.fat_g).filter((v): v is number => v != null);
  const saturatedFats = cohort.map((c) => c.saturated_fat_g).filter((v): v is number => v != null);
  const sodiums = cohort.map((c) => c.sodium_mg).filter((v): v is number => v != null);
  const kcals = cohort.map((c) => c.energy_kcal).filter((v): v is number => v != null);
  const fibers = cohort.map((c) => c.fiber_g).filter((v): v is number => v != null);
  const calciums = cohort.map((c) => c.calcium_mg).filter((v): v is number => v != null);
  const irons = cohort.map((c) => c.iron_mg).filter((v): v is number => v != null);
  const carbsList = cohort.map((c) => c.carbs_g).filter((v): v is number => v != null);

  const setMath = (id: TraitId, value: number | null) => {
    if (value == null) return;
    traits[id] = clamp01(value);
    trait_source[id] = "math";
    trait_confidence[id] = opts.data_quality_score;
  };

  const sugar = num(n?.sugar_g_100g ?? n?.added_sugar_g_100g);
  const protein = num(n?.protein_g_100g);
  const fat = num(n?.fat_g_100g);
  const saturatedFat = num(n?.saturated_fat_g_100g);
  const sodium = num(n?.sodium_mg_100g);
  const kcal = num(n?.energy_kcal_100g);
  const fiber = num(n?.fiber_g_100g);
  const calcium = num(n?.calcium_mg_100g);
  const iron = num(n?.iron_mg_100g);
  const carbs = num(n?.carbs_g_100g);

  if (protein != null && proteins.length >= 10) {
    setMath("protein_density", percentileRank(protein, proteins));
  }
  if (fiber != null && fibers.length >= 10) {
    setMath("fiber_density", percentileRank(fiber, fibers));
  }
  if (sugar != null && sugars.length >= 10) {
    setMath("low_sugar", percentileRank(sugar, sugars, true));
  }
  if (sodium != null && sodiums.length >= 10) {
    setMath("low_sodium", percentileRank(sodium, sodiums, true));
  }
  if (fat != null && fats.length >= 10) {
    setMath("low_fat", percentileRank(fat, fats, true));
  }
  if (saturatedFat != null && saturatedFats.length >= 10) {
    setMath("low_saturated_fat", percentileRank(saturatedFat, saturatedFats, true));
  }
  if (fat != null && saturatedFat != null && fat > 0 && fats.length >= 10 && saturatedFats.length >= 10) {
    const unsaturatedRatio = Math.max(0, (fat - saturatedFat) / fat);
    const cohortRatios = cohort
      .map((c) =>
        c.fat_g != null && c.saturated_fat_g != null && c.fat_g > 0
          ? Math.max(0, (c.fat_g - c.saturated_fat_g) / c.fat_g)
          : null,
      )
      .filter((v): v is number => v != null);
    if (cohortRatios.length >= 10) {
      setMath("healthy_fats", percentileRank(unsaturatedRatio, cohortRatios));
    }
  }
  if (calcium != null && calciums.length >= 10) {
    setMath("calcium_rich", percentileRank(calcium, calciums));
  }
  if (iron != null && irons.length >= 10) {
    setMath("iron_rich", percentileRank(iron, irons));
  }
  if (carbs != null && carbsList.length >= 10) {
    setMath("low_carb", percentileRank(carbs, carbsList, true));
  }
  if (kcal != null && kcals.length >= 10) {
    setMath("low_calorie_density", percentileRank(kcal, kcals, true));
  }
  if (opts.has_added_sugar === false) setMath("no_added_sugar", 0.9);
  else if (opts.has_added_sugar === true) setMath("no_added_sugar", 0.1);

  return { traits, trait_source, trait_confidence };
}

export function effectiveTraitScore(
  trait: TraitId,
  value: number | null | undefined,
  row: {
    trait_source: TraitSourceMap;
    trait_confidence: TraitConfidenceMap;
    data_quality_score: number;
  },
  calibratedConfidence?: (trait: TraitId, raw: number) => number,
): number {
  if (value == null || !Number.isFinite(value)) return 0;
  const src = row.trait_source[trait] ?? "math";
  const rawConf = row.trait_confidence[trait] ?? 0.5;
  const conf =
    src === "llm"
      ? Math.min(
          row.data_quality_score,
          calibratedConfidence ? calibratedConfidence(trait, rawConf) : rawConf,
        )
      : row.data_quality_score;
  return value * conf;
}

export function isQuantitativeTrait(trait: TraitId): boolean {
  return QUANTITATIVE_TRAITS.includes(trait);
}

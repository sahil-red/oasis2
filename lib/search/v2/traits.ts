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
  "calcium_rich",
  "no_added_sugar",
];

/** Compute math traits for one product given cohort nutrition within its primary_type. */
export function computeQuantitativeTraits(opts: {
  nutrition: ProductNutrition | null;
  has_added_sugar: boolean | null;
  data_quality_score: number;
  cohortByType: Map<string, Array<{ sugar_g: number | null; protein_g: number | null; fat_g: number | null; sodium_mg: number | null; energy_kcal: number | null; fiber_g: number | null }>>;
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
  const sodiums = cohort.map((c) => c.sodium_mg).filter((v): v is number => v != null);
  const kcals = cohort.map((c) => c.energy_kcal).filter((v): v is number => v != null);
  const fibers = cohort.map((c) => c.fiber_g).filter((v): v is number => v != null);

  const setMath = (id: TraitId, value: number | null) => {
    if (value == null) return;
    traits[id] = clamp01(value);
    trait_source[id] = "math";
    trait_confidence[id] = opts.data_quality_score;
  };

  const sugar = num(n?.sugar_g_100g ?? n?.added_sugar_g_100g);
  const protein = num(n?.protein_g_100g);
  const fat = num(n?.fat_g_100g);
  const sodium = num(n?.sodium_mg_100g);
  const kcal = num(n?.energy_kcal_100g);
  const fiber = num(n?.fiber_g_100g);

  if (protein != null && proteins.length >= 5) {
    setMath("protein_density", percentileRank(protein, proteins));
  }
  if (fiber != null && fibers.length >= 5) {
    setMath("fiber_density", percentileRank(fiber, fibers));
  }
  if (sugar != null && sugars.length >= 5) {
    setMath("low_sugar", percentileRank(sugar, sugars, true));
  }
  if (sodium != null && sodiums.length >= 5) {
    setMath("low_sodium", percentileRank(sodium, sodiums, true));
  }
  if (fat != null && fats.length >= 5) {
    setMath("low_fat", percentileRank(fat, fats, true));
  }
  if (kcal != null && kcals.length >= 5) {
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

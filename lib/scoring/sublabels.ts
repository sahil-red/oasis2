import { splitIngredientSegments } from "@/lib/ocr/format-ingredients";
import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";
import type { PerServeNutrition } from "@/lib/scoring/serving";
import type { RoleCohort } from "@/lib/scoring/role-cohort";
import type { VerdictId } from "@/lib/scoring/verdict";

export type SublabelId =
  | "clean_protein"
  | "rich_in_fiber"
  | "good_for_gut"
  | "heart_friendly"
  | "bone_support"
  | "good_for_bulking"
  | "low_glycemic"
  | "whole_food"
  | "naturally_fermented"
  | "immune_boost"
  | "healthy_snacking"
  | "clean_carbs"
  | "high_in_protein"
  | "mindful_portions"
  | "low_sodium"
  | "good_for_weight_loss"
  | "energy_dense"
  | "fortified_well"
  | "good_for_gym_goers"
  | "high_in_sugar"
  | "calorie_dense"
  | "refined_carbs_inside"
  | "high_saturated_fat"
  | "ultra_processed"
  | "artificial_flavors"
  | "best_in_category"
  | "watch_serving_size"
  | "hazardous_additive"
  | "empty_calories"
  | "excessive_sodium"
  | "very_high_in_sugar"
  | "trans_fat_present"
  | "label_mismatch"
  | "mostly_nova_4"
  | "hidden_sweetener";

export const SUBLABEL_DISPLAY: Record<SublabelId, string> = {
  clean_protein: "Clean protein",
  rich_in_fiber: "Rich in fiber",
  good_for_gut: "Good for gut",
  heart_friendly: "Heart-friendly",
  bone_support: "Bone support",
  good_for_bulking: "Good for bulking",
  low_glycemic: "Low glycemic",
  whole_food: "Whole food",
  naturally_fermented: "Naturally fermented",
  immune_boost: "Immune boost",
  healthy_snacking: "Healthy snacking",
  clean_carbs: "Clean carbs",
  high_in_protein: "High in protein",
  mindful_portions: "Mindful portions",
  low_sodium: "Low sodium",
  good_for_weight_loss: "Good for weight loss",
  energy_dense: "Energy-dense",
  fortified_well: "Fortified well",
  good_for_gym_goers: "Good for gym-goers",
  high_in_sugar: "High in sugar",
  calorie_dense: "Calorie-dense",
  refined_carbs_inside: "Refined carbs inside",
  high_saturated_fat: "High saturated fat",
  ultra_processed: "Ultra-processed",
  artificial_flavors: "Artificial flavors",
  best_in_category: "Best in category",
  watch_serving_size: "Watch serving size",
  hazardous_additive: "Hazardous additive",
  empty_calories: "Empty calories",
  excessive_sodium: "Excessive sodium",
  very_high_in_sugar: "Very high in sugar",
  trans_fat_present: "Trans fat present",
  label_mismatch: "Label mismatch",
  mostly_nova_4: "Mostly NOVA 4",
  hidden_sweetener: "Hidden sweetener",
};

const REFINED_FIRST = /\b(maida|refined wheat flour|sugar|corn syrup|glucose syrup|invert syrup|liquid glucose)\b/i;
const HIDDEN_SWEETENER = /\b(acesulfame|sucralose|aspartame|saccharin)\b/i;
const ARTIFICIAL = /\b(artificial flavour|artificial flavor|artificial colour|artificial color)\b/i;
const WHOLE_GRAIN = /\b(whole wheat|whole grain|ragi|bajra|jowar|millet|oats|atta)\b/i;

export type SublabelContext = {
  perServe: PerServeNutrition | null;
  ingredients_raw: string | null;
  ingredientRows: IngredientIntelligenceRow[];
  role_cohort: RoleCohort;
  absolute: number;
  relative: number | null;
  hazardous?: boolean;
  label_mismatch?: boolean;
  /** Phase 4: active goal id for contextual chips */
  goal_id?: string | null;
};

function ps(ctx: SublabelContext) {
  return ctx.perServe;
}

function hasBadTier(rows: IngredientIntelligenceRow[]): boolean {
  return rows.some((r) => r.concern_tier === "problematic" || r.concern_tier === "hazardous");
}

function weightedNova(rows: IngredientIntelligenceRow[]): number | null {
  if (!rows.length) return null;
  let w = 0;
  let s = 0;
  rows.forEach((r, i) => {
    const weight = Math.exp(-i / 3);
    w += (r.nova_class ?? 4) * weight;
    s += weight;
  });
  return s > 0 ? w / s : null;
}

function nova4Share(rows: IngredientIntelligenceRow[]): number {
  if (!rows.length) return 0;
  let w = 0;
  let s = 0;
  rows.forEach((r, i) => {
    const weight = Math.exp(-i / 3);
    if (r.nova_class === 4) w += weight;
    s += weight;
  });
  return s > 0 ? w / s : 0;
}

function firstThree(ingredients_raw: string | null): string[] {
  if (!ingredients_raw) return [];
  return splitIngredientSegments(ingredients_raw).slice(0, 3);
}

const POSITIVE: SublabelId[] = [
  "clean_protein",
  "rich_in_fiber",
  "good_for_gut",
  "heart_friendly",
  "bone_support",
  "good_for_bulking",
  "low_glycemic",
  "whole_food",
  "naturally_fermented",
  "immune_boost",
  "healthy_snacking",
  "clean_carbs",
  "high_in_protein",
  "mindful_portions",
  "low_sodium",
  "good_for_weight_loss",
  "energy_dense",
  "fortified_well",
  "good_for_gym_goers",
];

const NEGATIVE: SublabelId[] = [
  "high_in_sugar",
  "calorie_dense",
  "refined_carbs_inside",
  "high_saturated_fat",
  "ultra_processed",
  "artificial_flavors",
  "best_in_category",
  "watch_serving_size",
  "hazardous_additive",
  "empty_calories",
  "excessive_sodium",
  "very_high_in_sugar",
  "trans_fat_present",
  "label_mismatch",
  "mostly_nova_4",
  "hidden_sweetener",
];

function matches(id: SublabelId, ctx: SublabelContext): boolean {
  const p = ps(ctx);
  const rows = ctx.ingredientRows;
  const ing = ctx.ingredients_raw ?? "";

  switch (id) {
    case "clean_protein":
      return (p?.protein_g ?? 0) >= 6 && !hasBadTier(rows);
    case "rich_in_fiber":
      return (p?.fiber_g ?? 0) >= 4;
    case "good_for_gut":
      return rows.some(
        (r) =>
          (r.role === "probiotic" || /\b(probiotic|prebiotic|culture|lactic)\b/i.test(r.normalized_name)) &&
          r.concern_tier === "innocuous",
      );
    case "heart_friendly":
      return (
        (p?.saturated_fat_g ?? 99) <= 2 &&
        (p?.sodium_mg ?? 999) <= 200 &&
        (p?.fiber_g ?? 0) >= 3
      );
    case "bone_support":
      return (p?.calcium_mg ?? 0) >= 200;
    case "good_for_bulking":
      return (p?.energy_kcal ?? 0) >= 200 && (p?.protein_g ?? 0) >= 10;
    case "low_glycemic":
      return (
        (p?.sugar_g ?? 99) <= 3 &&
        !firstThree(ing).some((s) => REFINED_FIRST.test(s))
      );
    case "whole_food": {
      const nova = weightedNova(rows);
      const segCount = splitIngredientSegments(ing).length;
      return nova != null && nova <= 1.5 && segCount > 0 && segCount <= 5;
    }
    case "naturally_fermented":
      return (
        rows.some((r) => r.role === "probiotic") &&
        !/\b(preservative|artificial)\b/i.test(ing)
      );
    case "immune_boost":
      return false;
    case "healthy_snacking":
      return ctx.role_cohort === "snack" && ctx.absolute >= 68;
    case "clean_carbs":
      return (
        (p?.carbs_g ?? 0) >= 15 &&
        (p?.sugar_g ?? 99) <= 5 &&
        (WHOLE_GRAIN.test(ing) || rows.some((r) => r.role === "base_food"))
      );
    case "high_in_protein":
      return (p?.protein_g ?? 0) >= 10;
    case "mindful_portions":
      return (
        (ctx.role_cohort === "treat" || ctx.role_cohort === "snack") &&
        ctx.absolute >= 60 &&
        (p?.serving_g ?? 100) <= 25
      );
    case "low_sodium":
      return (p?.sodium_mg ?? 999) <= 120;
    case "good_for_weight_loss":
      return (
        (p?.energy_kcal ?? 999) <= 150 &&
        (p?.protein_g ?? 0) >= 5 &&
        (p?.fiber_g ?? 0) >= 2
      );
    case "energy_dense": {
      const nova = weightedNova(rows);
      return (p?.energy_kcal ?? 0) >= 300 && (nova ?? 4) <= 2;
    }
    case "fortified_well":
      return false;
    case "good_for_gym_goers": {
      const nova = weightedNova(rows);
      return (p?.protein_g ?? 0) >= 10 && (nova ?? 4) <= 2;
    }
    case "high_in_sugar":
      return (p?.sugar_g ?? 0) > 10;
    case "calorie_dense":
      return (
        (p?.energy_kcal ?? 0) >= 250 &&
        (p?.protein_g ?? 0) < 5 &&
        (p?.fiber_g ?? 0) < 2
      );
    case "refined_carbs_inside":
      return firstThree(ing).some((s) => REFINED_FIRST.test(s));
    case "high_saturated_fat":
      return (p?.saturated_fat_g ?? 0) > 4;
    case "ultra_processed":
      return nova4Share(rows) > 0.4;
    case "artificial_flavors":
      return (
        ARTIFICIAL.test(ing) ||
        rows.some((r) => r.role === "flavor" || r.role === "color")
      );
    case "best_in_category":
      return (ctx.relative ?? 0) >= 80 && ctx.absolute < 65;
    case "watch_serving_size":
      return false;
    case "hazardous_additive":
      return Boolean(ctx.hazardous);
    case "empty_calories":
      return (
        (p?.energy_kcal ?? 0) >= 100 &&
        (p?.protein_g ?? 0) <= 1 &&
        (p?.fiber_g ?? 0) === 0
      );
    case "excessive_sodium":
      return (p?.sodium_mg ?? 0) > 600;
    case "very_high_in_sugar":
      return (p?.sugar_g ?? 0) > 20;
    case "trans_fat_present":
      return (p?.trans_fat_g ?? 0) > 0.2;
    case "label_mismatch":
      return Boolean(ctx.label_mismatch);
    case "mostly_nova_4":
      return nova4Share(rows) > 0.6;
    case "hidden_sweetener":
      return HIDDEN_SWEETENER.test(ing) && /\b(natural|no added sugar)\b/i.test(ing);
    default:
      return false;
  }
}

/** Pick up to 3 sublabels for the verdict; positive story vs negative story only. */
export function pickVerdictSublabels(
  verdict: VerdictId,
  ctx: SublabelContext,
  max = 3,
): SublabelId[] {
  const pool =
    verdict === "daily_staple" || verdict === "good_choice" ? POSITIVE : NEGATIVE;

  const hits: SublabelId[] = [];
  for (const id of pool) {
    if (matches(id, ctx)) hits.push(id);
  }

  if (verdict === "skip" && ctx.hazardous && !hits.includes("hazardous_additive")) {
    hits.unshift("hazardous_additive");
  }

  return hits.slice(0, max);
}

export function sublabelsToDisplay(ids: SublabelId[]): string[] {
  return ids.map((id) => SUBLABEL_DISPLAY[id] ?? id);
}

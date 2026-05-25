import type { ProductNutrition } from "@/lib/supabase/types";
import { diabeticGoalFit, pcosGoalFit } from "@/lib/goals/glucose-fit";
import { proteinBudgetGoalFit } from "@/lib/products/pack-nutrition";
import {
  buildGoalFeatures,
  compactReason,
  goalPrimaryMetric,
  type GoalFeatureInput,
} from "./features";
import type { GoalId } from "./types";

export type GoalFitResult = {
  fit: number;
  label: string;
  reasons: string[];
  primaryMetric: string;
  shortReason: string;
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function buildHeroReasons(goal: GoalId, f: ReturnType<typeof buildGoalFeatures>, caption: string): string[] {
  const out: string[] = [caption];
  // Add at most one secondary fact that the caption didn't cover.
  const captionLower = caption.toLowerCase();
  const add = (s: string) => {
    if (out.length >= 2) return;
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  };
  if (goal === "balanced" || goal === "kids" || goal === "pcos") {
    if (f.additiveBurden >= 2 && !captionLower.includes("additive")) add("Several processing additives");
  }
  if (goal === "gym" || goal === "protein-budget" || goal === "bulk") {
    if (f.protein >= 15 && !captionLower.includes("protein")) add("Decent protein density");
  }
  if (goal === "fat-loss" && f.fiber >= 5 && !captionLower.includes("fibre")) add("Good fibre");
  if (goal === "diabetic" || goal === "pcos") {
    if (f.fiber >= 5 && !captionLower.includes("fibre")) add("Fibre helps the curve");
  }
  return out;
}

function result(goal: GoalId, fit: number, _reasons: string[], f: ReturnType<typeof buildGoalFeatures>): GoalFitResult {
  const caption = goalPrimaryMetric(goal, f);
  return {
    fit: clamp(fit),
    label: goal === "balanced" ? "Overall" : "Goal fit",
    reasons: buildHeroReasons(goal, f, caption),
    primaryMetric: caption,
    shortReason: caption,
  };
}

export function computeGoalFit(
  goal: GoalId,
  opts: GoalFeatureInput,
): GoalFitResult {
  const f = buildGoalFeatures(opts);
  if (goal === "balanced") {
    return result(goal, opts.core_score ?? 50, ["Overall label quality"], f);
  }

  const reasons: string[] = [];
  let fit = 50;

  switch (goal) {
    case "gym": {
      if (!f.hasNutrition) {
        fit = opts.core_score ?? 50;
        break;
      }
      fit =
        f.protein * 3.2 +
        Math.min(18, f.proteinPer100Kcal * 2.2) +
        Math.min(10, f.fiber * 1.2) -
        f.addedSugar * 1.2 -
        f.saturatedFat * 0.8 -
        Math.max(0, f.kcal - 420) * 0.04 -
        f.additiveBurden * 4 -
        Math.max(0, f.sodium - 400) * 0.012;
      if (f.isProteinSnack) fit = Math.min(fit, f.additiveBurden > 1.5 ? 76 : 82);
      if (f.protein < 5) fit = Math.min(fit, 30);
      break;
    }
    case "bulk": {
      if (!f.hasNutrition) {
        fit = opts.core_score ?? 50;
        break;
      }
      // Anchor to core quality so junky calories can't beat clean calorie-dense food.
      const qualityAnchor = (opts.core_score ?? 50) * 0.30;
      fit =
        qualityAnchor +
        Math.min(28, Math.max(0, (f.kcal - 180) * 0.09)) +
        Math.min(24, f.protein * 1.8) +
        Math.min(10, f.kcalPerRupee100 * 0.022) +
        (f.carbs > 35 ? 6 : f.carbs > 22 ? 3 : 0) -
        f.addedSugar * 0.7 -
        f.additiveBurden * 3 -
        Math.max(0, f.sodium - 300) * 0.012 -
        Math.max(0, f.saturatedFat - 8) * 0.5;
      if (f.addedSugar > 18 && !f.isStaple) fit = Math.min(fit, 55);
      if (f.sodium >= 1000) fit = Math.min(fit, 55);
      if (f.kcal < 200) fit = Math.min(fit, 40);
      break;
    }
    case "diabetic": {
      if (!f.hasNutrition) {
        fit = Math.max(0, (opts.core_score ?? 50) - f.additiveBurden * 8);
        break;
      }
      const d = diabeticGoalFit({
        nutrition: opts.nutrition!,
        addedSugarG: f.addedSugar,
        sugarG: f.sugar,
        carbsG: f.carbs,
        fiberG: f.fiber,
        flagged: Math.round(f.additiveBurden),
        name: opts.name ?? "",
        category: opts.category ?? null,
        subcategory: opts.subcategory ?? null,
      });
      fit = d.fit;
      if (f.processingNotes.some((n) => /syrup|refined/i.test(n))) fit -= 8;
      if (f.isSnack && f.netCarbs > 15) fit = Math.min(fit, 70);
      break;
    }
    case "pcos": {
      if (!f.hasNutrition) {
        fit = Math.max(0, (opts.core_score ?? 50) - f.additiveBurden * 8);
        break;
      }
      const p = pcosGoalFit({
        nutrition: opts.nutrition!,
        addedSugarG: f.addedSugar,
        sugarG: f.sugar,
        carbsG: f.carbs,
        fiberG: f.fiber,
        flagged: Math.round(f.additiveBurden),
        name: opts.name ?? "",
        category: opts.category ?? null,
        subcategory: opts.subcategory ?? null,
      });
      fit = p.fit;
      if (f.isSweetSnack) fit -= 4;
      if (f.isSnack && f.netCarbs > 15) fit = Math.min(fit, 72);
      break;
    }
    case "fat-loss": {
      if (!f.hasNutrition) {
        fit = opts.core_score ?? 50;
        break;
      }
      fit =
        76 -
        f.kcal * 0.075 +
        f.protein * 2.2 +
        f.fiber * 2.4 -
        f.addedSugar * 2 -
        f.sodium * 0.006 -
        f.additiveBurden * 4.5;
      if (f.isProteinSnack && f.kcal > 360) fit = Math.min(fit, 68);
      break;
    }
    case "veg": {
      if (f.hasMeatOrFish || (!f.allowEggs && f.hasEggs)) {
        fit = 0;
        break;
      }
      fit = (opts.core_score ?? 55) + (f.isVegLabel ? 8 : 0) + f.fiber * 1.1 - f.additiveBurden * 5;
      break;
    }
    case "vegan": {
      if (f.hasAnimalDerived) {
        fit = 0;
        break;
      }
      fit = (opts.core_score ?? 55) + (f.isVegLabel ? 4 : 0) + f.fiber * 1.2 - f.additiveBurden * 7;
      break;
    }
    case "protein-budget": {
      if (!f.hasNutrition) {
        fit = Math.round((opts.core_score ?? 0) * 0.25);
        break;
      }
      const effectiveProtein = f.proteinInPack ?? f.protein;
      if (f.protein < 6 && effectiveProtein < 6) {
        fit = Math.min(20, Math.round(f.protein * 2 + (opts.core_score ?? 0) * 0.08));
        break;
      }
      fit = proteinBudgetGoalFit({
        proteinPerRupee100: f.proteinPerRupee100,
        protein_g_100g: f.protein,
        core_score: opts.core_score,
      });
      if (f.isProteinSnack && f.additiveBurden > 1.5) fit = Math.min(fit, 76);
      break;
    }
    case "kids": {
      fit = (opts.core_score ?? 50) - f.additiveBurden * 10 - f.addedSugar * 1.2 - f.sodium * 0.005;
      if (f.isSweetSnack) fit -= 8;
      if (f.isSugaryDrink) fit -= 12;
      if (!f.hasIngredientData && (f.isSnack || f.isSugaryDrink || f.addedSugar > 0)) {
        fit = Math.min(fit, 50);
      }
      break;
    }
  }

  return result(goal, fit, reasons, f);
}

/** Shared inputs for catalog sorting and PDP goal fit. */
export function goalFitInputs(p: {
  nutrition: ProductNutrition | null;
  ingredients_raw: string | null;
  price_inr: number | null;
  net_weight?: string | null;
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  core_scores?: { score: number } | null;
  attributes?: Record<string, string> | null;
  veg_allow_eggs?: boolean;
}) {
  return {
    nutrition: p.nutrition,
    ingredients_raw: p.ingredients_raw,
    price_inr: p.price_inr,
    net_weight: p.net_weight ?? null,
    name: p.name ?? null,
    category: p.category ?? null,
    subcategory: p.subcategory ?? null,
    core_score: p.core_scores?.score ?? null,
    attributes: p.attributes ?? null,
    veg_allow_eggs: p.veg_allow_eggs,
  };
}

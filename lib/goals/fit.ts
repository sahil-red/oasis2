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

function result(goal: GoalId, fit: number, reasons: string[], f: ReturnType<typeof buildGoalFeatures>): GoalFitResult {
  const cleanReasons = reasons.filter(Boolean).slice(0, 3);
  return {
    fit: clamp(fit),
    label: goal === "balanced" ? "Overall" : "Goal fit",
    reasons: cleanReasons,
    primaryMetric: goalPrimaryMetric(goal, f),
    shortReason: compactReason(cleanReasons, f),
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
        reasons.push("Limited label data — using overall score");
        break;
      }
      fit =
        f.protein * 3.2 +
        Math.min(18, f.proteinPer100Kcal * 2.2) +
        Math.min(10, f.fiber * 1.2) -
        f.addedSugar * 1.2 -
        f.saturatedFat * 0.8 -
        Math.max(0, f.kcal - 420) * 0.04 -
        f.additiveBurden * 4;
      if (f.isProteinSnack) fit = Math.min(fit, f.additiveBurden > 1.5 ? 78 : 84);
      if (f.protein >= 15) reasons.push(`${f.protein}g protein per 100g`);
      if (f.proteinPer100Kcal >= 8) reasons.push("Good protein per calorie");
      if (f.addedSugar > 8) reasons.push(`${f.addedSugar}g added sugar`);
      break;
    }
    case "bulk": {
      if (!f.hasNutrition) {
        fit = opts.core_score ?? 50;
        reasons.push("Limited label data — using overall score");
        break;
      }
      fit =
        Math.min(34, Math.max(0, (f.kcal - 180) * 0.11)) +
        Math.min(32, f.protein * 2.2) +
        Math.min(12, f.kcalPerRupee100 * 0.025) +
        (f.carbs > 35 ? 8 : f.carbs > 22 ? 4 : 0) -
        f.addedSugar * 0.9 -
        f.additiveBurden * 3.5;
      if (f.addedSugar > 18 && !f.isStaple) fit = Math.min(fit, 60);
      if (f.kcal >= 350) reasons.push(`${f.kcal} kcal per 100g`);
      if (f.protein >= 12) reasons.push(`${f.protein}g protein`);
      if (f.addedSugar > 15) reasons.push("High sugar for a staple");
      break;
    }
    case "diabetic": {
      if (!f.hasNutrition) {
        fit = Math.max(0, (opts.core_score ?? 50) - f.additiveBurden * 8);
        reasons.push("Limited data — penalising processing additives");
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
      reasons.push(...d.reasons);
      break;
    }
    case "pcos": {
      if (!f.hasNutrition) {
        fit = Math.max(0, (opts.core_score ?? 50) - f.additiveBurden * 8);
        reasons.push("Limited data — penalising processing additives");
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
      reasons.push(...p.reasons);
      break;
    }
    case "fat-loss": {
      if (!f.hasNutrition) {
        fit = opts.core_score ?? 50;
        reasons.push("No nutrition table — using Core score");
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
      if (f.kcal) reasons.push(`${f.kcal} kcal / 100g`);
      if (f.protein >= 10) reasons.push(`${f.protein}g protein`);
      if (f.fiber >= 5) reasons.push(`${f.fiber}g fibre`);
      break;
    }
    case "veg": {
      if (f.hasMeatOrFish || (!f.allowEggs && f.hasEggs)) {
        fit = 0;
        reasons.push(
          f.hasMeatOrFish
            ? "Contains meat or fish — not vegetarian"
            : "Contains egg — excluded in your veg settings",
        );
        break;
      }
      fit = (opts.core_score ?? 55) + (f.isVegLabel ? 8 : 0) + f.fiber * 1.1 - f.additiveBurden * 5;
      if (f.isVegLabel) reasons.push("Marked vegetarian on pack");
      else reasons.push("No meat or fish on label");
      if (f.allowEggs && f.hasEggs) {
        reasons.push("Eggs allowed in your veg mode");
      } else if (!f.allowEggs) {
        reasons.push("Egg-free filter on");
      }
      break;
    }
    case "vegan": {
      if (f.hasAnimalDerived) {
        fit = 0;
        reasons.push("Contains animal-derived ingredients — not vegan");
        break;
      }
      fit = (opts.core_score ?? 55) + (f.isVegLabel ? 4 : 0) + f.fiber * 1.2 - f.additiveBurden * 7;
      reasons.push("No obvious animal ingredients on label");
      if (f.additiveBurden > 2) reasons.push("Processed label pulls it down");
      break;
    }
    case "protein-budget": {
      if (!f.hasNutrition) {
        fit = Math.round((opts.core_score ?? 0) * 0.25);
        reasons.push("No nutrition table — weak for protein value");
        break;
      }
      const effectiveProtein = f.proteinInPack ?? f.protein;
      if (f.protein < 6 && effectiveProtein < 6) {
        fit = Math.min(20, Math.round(f.protein * 2 + (opts.core_score ?? 0) * 0.08));
        reasons.push(`${f.protein}g protein per 100g — too low for this goal`);
        break;
      }
      fit = proteinBudgetGoalFit({
        proteinPerRupee100: f.proteinPerRupee100,
        protein_g_100g: f.protein,
        core_score: opts.core_score,
      });
      if (f.isProteinSnack && f.additiveBurden > 1.5) fit = Math.min(fit, 76);
      if (f.proteinInPack != null) {
        reasons.push(
          `${f.proteinInPack.toFixed(1)}g protein in pack (${f.protein}g / 100g) · ₹${f.price}`,
        );
        if (f.proteinPerRupee100 > 0) reasons.push(`~${f.proteinPerRupee100.toFixed(1)}g protein per ₹100`);
      } else {
        reasons.push(
          f.price > 0
            ? `${f.protein}g protein / 100g · ₹${f.price}`
            : `${f.protein}g protein / 100g`,
        );
      }
      if (fit >= 70 && f.protein < 10 && (f.proteinInPack ?? 0) < 12) {
        reasons.push("Label density is modest — value may be mostly price");
      }
      break;
    }
    case "kids": {
      fit = (opts.core_score ?? 50) - f.additiveBurden * 10 - f.addedSugar * 1.2 - f.sodium * 0.005;
      if (f.isSweetSnack) fit -= 8;
      if (f.additiveBurden < 0.5) reasons.push("Cleaner ingredient profile");
      else if (f.additiveBurden >= 4) reasons.push("Several processing additives on label");
      else reasons.push("Some processing additives on label");
      if (f.addedSugar > 8) reasons.push(`${f.addedSugar}g added sugar`);
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

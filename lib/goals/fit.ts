import { additiveGoalBurden } from "@/lib/scoring/ingredient-signals";
import type { ProductNutrition } from "@/lib/supabase/types";
import {
  hasEggs,
  isVegetarianCompatible,
  vegetarianLabelHint,
} from "@/lib/goals/vegetarian";
import { hasAnimalDerived } from "@/lib/goals/vegan";
import { diabeticGoalFit, pcosGoalFit } from "@/lib/goals/glucose-fit";
import { packNutritionContext, proteinBudgetGoalFit } from "@/lib/products/pack-nutrition";
import type { GoalId } from "./types";

export type GoalFitResult = {
  fit: number;
  label: string;
  reasons: string[];
};

function num(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function sugar(n: ProductNutrition | null): number | null {
  return num(n?.sugar_g_100g) ?? num(n?.added_sugar_g_100g);
}

export function computeGoalFit(
  goal: GoalId,
  opts: {
    nutrition: ProductNutrition | null;
    ingredients_raw: string | null;
    price_inr: number | null;
    net_weight?: string | null;
    core_score?: number | null;
    attributes?: Record<string, string> | null;
    name?: string | null;
    category?: string | null;
    subcategory?: string | null;
    /** When goal is `veg`: if true, products with egg are allowed. */
    veg_allow_eggs?: boolean;
  },
): GoalFitResult {
  if (goal === "balanced") {
    const s = opts.core_score ?? 50;
    return {
      fit: s,
      label: "Overall",
      reasons: ["Sorted by overall label score."],
    };
  }

  const n = opts.nutrition;
  const attrs = opts.attributes ?? null;
  const hasNutrition = n != null && Object.keys(n).length > 0;
  const protein = num(n?.protein_g_100g) ?? 0;
  const sugarG = sugar(n) ?? 0;
  const addedSugarG = num(n?.added_sugar_g_100g) ?? sugarG;
  const fiber = num(n?.fiber_g_100g) ?? 0;
  const kcal = num(n?.energy_kcal_100g) ?? 0;
  const carbs = num(n?.carbs_g_100g) ?? 0;
  const price = opts.price_inr ?? 0;
  const additiveBurden = additiveGoalBurden(opts.ingredients_raw);
  const reasons: string[] = [];
  let fit = 50;

  switch (goal) {
    case "gym": {
      if (!hasNutrition) {
        fit = opts.core_score ?? 50;
        reasons.push("Limited label data — using overall score");
        break;
      }
      fit = Math.min(100, protein * 4 + fiber * 2 - sugarG * 1.5 - Math.max(0, kcal - 350) * 0.05);
      if (protein >= 15) reasons.push(`${protein}g protein per 100g`);
      if (sugarG > 12) reasons.push(`${sugarG}g sugar — a bit high for training`);
      break;
    }
    case "bulk": {
      if (!hasNutrition) {
        fit = opts.core_score ?? 50;
        reasons.push("Limited label data — using overall score");
        break;
      }
      const calScore = Math.min(35, Math.max(0, (kcal - 200) * 0.12));
      fit = Math.min(
        100,
        calScore + protein * 2.5 + (carbs > 40 ? 8 : carbs > 25 ? 4 : 0) - sugarG * 0.8 - additiveBurden * 4,
      );
      if (kcal >= 350) reasons.push(`${kcal} kcal per 100g — calorie dense`);
      else if (kcal >= 250) reasons.push(`${kcal} kcal per 100g`);
      if (protein >= 12) reasons.push(`${protein}g protein`);
      if (sugarG > 15) reasons.push(`High sugar for a bulk staple`);
      break;
    }
    case "diabetic": {
      if (!hasNutrition) {
        fit = Math.max(0, (opts.core_score ?? 50) - additiveBurden * 8);
        reasons.push("Limited data — penalising flagged additives");
        break;
      }
      const d = diabeticGoalFit({
        nutrition: n!,
        addedSugarG,
        sugarG,
        carbsG: carbs,
        fiberG: fiber,
        flagged: Math.round(additiveBurden),
        name: opts.name ?? "",
        category: opts.category ?? null,
        subcategory: opts.subcategory ?? null,
      });
      fit = d.fit;
      reasons.push(...d.reasons);
      break;
    }
    case "pcos": {
      if (!hasNutrition) {
        fit = Math.max(0, (opts.core_score ?? 50) - additiveBurden * 8);
        reasons.push("Limited data — penalising processing additives");
        break;
      }
      const p = pcosGoalFit({
        nutrition: n!,
        addedSugarG,
        sugarG,
        carbsG: carbs,
        fiberG: fiber,
        flagged: Math.round(additiveBurden),
        name: opts.name ?? "",
        category: opts.category ?? null,
        subcategory: opts.subcategory ?? null,
      });
      fit = p.fit;
      reasons.push(...p.reasons);
      break;
    }
    case "fat-loss": {
      if (!hasNutrition) {
        fit = opts.core_score ?? 50;
        reasons.push("No nutrition table — using Core score");
        break;
      }
      fit = Math.min(
        100,
        80 - kcal * 0.08 + protein * 2 + fiber * 2 - sugarG * 2 - additiveBurden * 5,
      );
      if (kcal) reasons.push(`${kcal} kcal / 100g`);
      if (protein >= 10) reasons.push(`${protein}g protein`);
      break;
    }
    case "veg": {
      const allowEggs = opts.veg_allow_eggs === true;
      const compat = isVegetarianCompatible(
        {
          ingredients_raw: opts.ingredients_raw,
          attributes: attrs,
          product_name: opts.name ?? null,
        },
        allowEggs,
      );
      if (!compat.ok) {
        fit = 0;
        if (compat.reason) reasons.push(compat.reason);
        break;
      }
      const vegLabel = vegetarianLabelHint(attrs);
      fit = Math.min(
        100,
        (opts.core_score ?? 55) + (vegLabel ? 10 : 0) + fiber * 1.2 - additiveBurden * 6,
      );
      if (vegLabel) reasons.push("Marked vegetarian on pack");
      else reasons.push("No meat or fish on label");
      if (allowEggs && hasEggs({ ingredients_raw: opts.ingredients_raw, attributes: attrs })) {
        reasons.push("Eggs allowed in your veg mode");
      } else if (!allowEggs) {
        reasons.push("Egg-free filter on");
      }
      break;
    }
    case "vegan": {
      const diet =
        attrs?.["Diet Preference"] ??
        attrs?.["Diet"] ??
        attrs?.["Food Preference"] ??
        "";
      const animalHit = hasAnimalDerived({
        ingredients_raw: opts.ingredients_raw,
        attributes: attrs,
      });
      if (animalHit) {
        fit = 0;
        if (diet) reasons.push(`Label: ${diet}`);
        reasons.push("Contains animal-derived ingredients — not vegan");
        break;
      }
      const vegLabel =
        /(^|\s)veg(etarian)?(\s|$)/i.test(diet) && !/non[- ]?veg/i.test(diet);
      fit = Math.min(100, (vegLabel ? 88 : 78) + fiber * 1.5 - additiveBurden * 8);
      if (vegLabel) reasons.push("Marked vegetarian on pack");
      else reasons.push("No obvious animal ingredients on label");
      break;
    }
    case "protein-budget": {
      if (!hasNutrition) {
        fit = Math.round((opts.core_score ?? 0) * 0.25);
        reasons.push("No nutrition table — weak for protein value");
        break;
      }
      const packCtx = packNutritionContext({
        nutrition: n,
        price_inr: price,
        net_weight: opts.net_weight,
      });
      const proteinInPack = packCtx.proteinInPack;
      const effectiveProtein = proteinInPack ?? protein;

      if (protein < 6 && effectiveProtein < 6) {
        fit = Math.min(20, Math.round(protein * 2 + (opts.core_score ?? 0) * 0.08));
        reasons.push(`${protein}g protein per 100g — too low for this goal`);
        break;
      }
      const ppr = packCtx.proteinPerRupee100 ?? 0;
      fit = proteinBudgetGoalFit({
        proteinPerRupee100: ppr,
        protein_g_100g: protein,
        core_score: opts.core_score,
      });
      if (packCtx.usesPack && proteinInPack != null) {
        reasons.push(
          `${proteinInPack.toFixed(1)}g protein in pack (${protein}g / 100g) · ₹${price}`,
        );
        if (ppr > 0) reasons.push(`~${ppr.toFixed(1)}g protein per ₹100 spent`);
      } else {
        reasons.push(
          price > 0
            ? `${protein}g protein / 100g · ₹${price} (~${ppr.toFixed(1)}g per ₹100)`
            : `${protein}g protein / 100g`,
        );
      }
      if (fit >= 70 && protein < 10 && (proteinInPack ?? 0) < 12) {
        reasons.push("Label density is modest — value may be mostly price");
      }
      break;
    }
    case "kids": {
      fit = Math.min(100, (opts.core_score ?? 50) - additiveBurden * 10);
      if (additiveBurden < 0.5) reasons.push("Cleaner ingredient profile");
      else if (additiveBurden >= 4) reasons.push("Several processing additives on label");
      else reasons.push("Some processing additives on label");
      break;
    }
  }

  return {
    fit: Math.max(0, Math.min(100, Math.round(fit))),
    label: "Goal fit",
    reasons: reasons.slice(0, 3),
  };
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

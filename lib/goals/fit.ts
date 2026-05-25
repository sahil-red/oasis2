import { matchAdditives } from "@/lib/scoring/rules";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { GoalId } from "./types";

export type GoalFitResult = {
  fit: number;
  label: string;
  reasons: string[];
};

const ANIMAL =
  /\b(milk|whey|casein|egg|honey|gelatin|ghee|butter|cheese|fish|chicken|mutton|beef|pork|lactose)\b/i;

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
    core_score?: number | null;
    attributes?: Record<string, string> | null;
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
  const fiber = num(n?.fiber_g_100g) ?? 0;
  const kcal = num(n?.energy_kcal_100g) ?? 0;
  const carbs = num(n?.carbs_g_100g) ?? 0;
  const price = opts.price_inr ?? 0;
  const flagged = matchAdditives(opts.ingredients_raw).filter(
    (m) => m.tier === "moderate" || m.tier === "hazardous",
  ).length;
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
        calScore + protein * 2.5 + (carbs > 40 ? 8 : carbs > 25 ? 4 : 0) - sugarG * 0.8 - flagged * 5,
      );
      if (kcal >= 350) reasons.push(`${kcal} kcal per 100g — calorie dense`);
      else if (kcal >= 250) reasons.push(`${kcal} kcal per 100g`);
      if (protein >= 12) reasons.push(`${protein}g protein`);
      if (sugarG > 15) reasons.push(`High sugar for a bulk staple`);
      break;
    }
    case "diabetic": {
      if (!hasNutrition) {
        fit = Math.max(0, (opts.core_score ?? 50) - flagged * 10);
        reasons.push("Limited data — penalising flagged additives");
        break;
      }
      fit = Math.min(100, 88 - sugarG * 3.2 - carbs * 0.35 + fiber * 2.2 - flagged * 8);
      if (sugarG <= 5) reasons.push(`Low sugar (${sugarG}g / 100g)`);
      else reasons.push(`${sugarG}g sugar / 100g`);
      if (fiber >= 4) reasons.push(`${fiber}g fibre`);
      break;
    }
    case "pcos": {
      if (!hasNutrition) {
        fit = Math.max(0, (opts.core_score ?? 50) - flagged * 12);
        reasons.push("Limited data — penalising flagged additives");
        break;
      }
      const carbPenalty = carbs > 45 ? 12 : carbs > 30 ? 6 : 0;
      fit = Math.min(
        100,
        82 - sugarG * 3.5 - carbs * 0.5 + fiber * 2.5 - flagged * 10 - carbPenalty,
      );
      if (sugarG <= 5) reasons.push(`Low sugar (${sugarG}g / 100g)`);
      else reasons.push(`${sugarG}g sugar / 100g`);
      if (carbPenalty) reasons.push(`Higher carbs (${carbs}g / 100g)`);
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
        80 - kcal * 0.08 + protein * 2 + fiber * 2 - sugarG * 2 - flagged * 6,
      );
      if (kcal) reasons.push(`${kcal} kcal / 100g`);
      if (protein >= 10) reasons.push(`${protein}g protein`);
      break;
    }
    case "vegan": {
      const text = opts.ingredients_raw ?? "";
      const diet =
        attrs?.["Diet Preference"] ??
        attrs?.["Diet"] ??
        attrs?.["Food Preference"] ??
        "";
      const nonVegLabel = /non[- ]?veg|contains egg|egg\b/i.test(diet);
      const vegLabel = /(^|\s)veg(etarian)?(\s|$)/i.test(diet) && !nonVegLabel;
      const animalHit = nonVegLabel || ANIMAL.test(text);
      fit = animalHit
        ? Math.max(0, 20 - flagged * 6)
        : Math.min(100, (vegLabel ? 88 : 75) + fiber * 1.5 - flagged * 10);
      if (nonVegLabel) reasons.push(`Label: ${diet}`);
      else if (vegLabel) reasons.push("Marked vegetarian on pack");
      reasons.push(
        animalHit && !nonVegLabel
          ? "Contains animal-derived ingredients"
          : animalHit
            ? "Not plant-based"
            : "No obvious animal ingredients",
      );
      break;
    }
    case "protein-budget": {
      const ppr = price > 0 ? (protein / price) * 100 : protein * 2;
      fit = Math.min(
        100,
        (price > 0 ? ppr * 35 : protein * 6) + (opts.core_score ?? 0) * 0.2,
      );
      reasons.push(
        price > 0
          ? `${protein}g protein · ₹${price} (~${ppr.toFixed(1)}g protein per ₹100)`
          : `${protein}g protein / 100g`,
      );
      break;
    }
    case "kids": {
      fit = Math.min(100, (opts.core_score ?? 50) - flagged * 12);
      if (flagged === 0) reasons.push("No flagged additives");
      else reasons.push(`${flagged} flagged additive(s)`);
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
  core_scores?: { score: number } | null;
  attributes?: Record<string, string> | null;
}) {
  return {
    nutrition: p.nutrition,
    ingredients_raw: p.ingredients_raw,
    price_inr: p.price_inr,
    core_score: p.core_scores?.score ?? null,
    attributes: p.attributes ?? null,
  };
}

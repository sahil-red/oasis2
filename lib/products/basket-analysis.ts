import { computeGoalFit, goalFitInputs } from "@/lib/goals/fit";
import { GOAL_PROFILES, type GoalId } from "@/lib/goals/types";
import { matchAdditives } from "@/lib/scoring/rules";
import type { ProductListItem } from "@/lib/products/queries";

export type BasketLine = {
  product: ProductListItem;
  qty: number;
};

export type BasketAnalysis = {
  itemCount: number;
  totalInr: number;
  avgCoreScore: number | null;
  avgGoalFit: number | null;
  proteinPct: number | null;
  avgSugarG: number | null;
  avgFiberG: number | null;
  snackHeavyPct: number | null;
  flaggedAdditiveSkus: number;
  summary: string[];
  goalLabel: string;
};

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function analyzeBasket(
  lines: BasketLine[],
  goal: GoalId = "balanced",
  opts?: { veg_allow_eggs?: boolean },
): BasketAnalysis {
  const items = lines.flatMap((l) => Array(l.qty).fill(l.product) as ProductListItem[]);
  const withNutrition = items.filter((p) => p.nutrition);
  const scores = items.map((p) => p.core_scores?.score).filter((s): s is number => s != null);
  const goalFits =
    goal === "balanced"
      ? []
      : items.map((p) =>
          computeGoalFit(goal, {
            ...goalFitInputs(p),
            veg_allow_eggs: goal === "veg" ? opts?.veg_allow_eggs : undefined,
          }).fit,
        );
  const totalInr = lines.reduce((s, l) => s + (l.product.price_inr ?? 0) * l.qty, 0);

  let proteinPct: number | null = null;
  let avgSugarG: number | null = null;
  let avgFiberG: number | null = null;
  let snackHeavyPct: number | null = null;

  if (withNutrition.length) {
    const macros = withNutrition.map((p) => {
      const n = p.nutrition!;
      const pG = n.protein_g_100g ?? 0;
      const cG = n.carbs_g_100g ?? 0;
      const fG = n.fat_g_100g ?? 0;
      const macroSum = pG + cG + fG || 1;
      return {
        proteinShare: (pG / macroSum) * 100,
        sugar: n.sugar_g_100g ?? n.added_sugar_g_100g,
        fiber: n.fiber_g_100g,
      };
    });
    proteinPct = avg(macros.map((m) => m.proteinShare));
    const sugars = macros.map((m) => m.sugar).filter((s): s is number => typeof s === "number");
    const fibers = macros.map((m) => m.fiber).filter((f): f is number => typeof f === "number");
    avgSugarG = sugars.length ? avg(sugars) : null;
    avgFiberG = fibers.length ? avg(fibers) : null;
    const heavy = withNutrition.filter(
      (p) =>
        (p.nutrition?.sugar_g_100g ?? 0) > 15 &&
        (p.nutrition?.protein_g_100g ?? 0) < 8 &&
        matchAdditives(p.ingredients_raw).length > 0,
    ).length;
    snackHeavyPct = (heavy / withNutrition.length) * 100;
  }

  const flaggedAdditiveSkus = items.filter((p) =>
    matchAdditives(p.ingredients_raw).some((m) => m.tier === "moderate" || m.tier === "hazardous"),
  ).length;

  const goalProfile = GOAL_PROFILES.find((g) => g.id === goal);
  const goalLabel = goalProfile?.label ?? "Balanced";
  const summary: string[] = [];

  if (goal !== "balanced" && goalFits.length) {
    const avgFit = avg(goalFits)!;
    const weak = items.filter(
      (p) => computeGoalFit(goal, goalFitInputs(p)).fit < 45,
    ).length;
    summary.push(
      `For ${goalLabel}, this cart averages ${avgFit.toFixed(0)} / 100 across items.`,
    );
    if (weak > 0) {
      summary.push(
        `${weak} item${weak === 1 ? "" : "s"} score below 45 for that goal — worth a swap.`,
      );
    } else {
      summary.push("Nothing here looks like a bad fit for your goal.");
    }
  } else if (scores.length) {
    summary.push(`Overall scores average ${avg(scores)!.toFixed(0)} across the cart.`);
  }

  if (goal === "gym" || goal === "bulk" || goal === "protein-budget") {
    if (proteinPct != null && proteinPct < 18) {
      summary.push("Protein is on the low side for this cart — add a higher-protein staple.");
    } else if (proteinPct != null) {
      summary.push(`Roughly ${proteinPct.toFixed(0)}% of macros from protein (label averages).`);
    }
  }

  if (goal === "diabetic" || goal === "pcos" || goal === "fat-loss") {
    if (avgSugarG != null && avgSugarG > 10) {
      summary.push(`Average sugar is ~${avgSugarG.toFixed(1)}g per 100g — consider lower-sugar swaps.`);
    } else if (avgSugarG != null) {
      summary.push(`Sugar stays around ${avgSugarG.toFixed(1)}g per 100g on average.`);
    }
  }

  if (flaggedAdditiveSkus > 0) {
    summary.push(
      `${flaggedAdditiveSkus} item${flaggedAdditiveSkus === 1 ? "" : "s"} with flagged additives.`,
    );
  }

  if (summary.length === 0 && scores.length) {
    summary.push(`Looks like a mixed cart — overall score ~${avg(scores)!.toFixed(0)}.`);
  }

  return {
    itemCount: items.length,
    totalInr,
    avgCoreScore: scores.length ? avg(scores) : null,
    avgGoalFit: goalFits.length ? avg(goalFits) : null,
    proteinPct,
    avgSugarG,
    avgFiberG,
    snackHeavyPct,
    flaggedAdditiveSkus,
    summary: summary.slice(0, 4),
    goalLabel,
  };
}

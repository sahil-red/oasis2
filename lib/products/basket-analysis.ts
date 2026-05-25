import { matchAdditives } from "@/lib/scoring/rules";
import type { ProductListItem } from "@/lib/products/queries";
import type { ProductNutrition } from "@/lib/supabase/types";

export type BasketLine = {
  product: ProductListItem;
  qty: number;
};

export type BasketAnalysis = {
  itemCount: number;
  totalInr: number;
  avgCoreScore: number | null;
  proteinPct: number | null;
  avgSugarG: number | null;
  avgFiberG: number | null;
  ultraProcessedPct: number | null;
  flaggedAdditiveSkus: number;
  summary: string[];
};

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function analyzeBasket(lines: BasketLine[]): BasketAnalysis {
  const items = lines.flatMap((l) => Array(l.qty).fill(l.product) as ProductListItem[]);
  const withNutrition = items.filter((p) => p.nutrition);
  const scores = items.map((p) => p.core_scores?.score).filter((s): s is number => s != null);
  const totalInr = lines.reduce(
    (s, l) => s + (l.product.price_inr ?? 0) * l.qty,
    0,
  );

  let proteinPct: number | null = null;
  let avgSugarG: number | null = null;
  let avgFiberG: number | null = null;
  let ultraProcessedPct: number | null = null;

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
    const ultra = withNutrition.filter(
      (p) =>
        (p.nutrition?.sugar_g_100g ?? 0) > 15 &&
        (p.nutrition?.protein_g_100g ?? 0) < 8 &&
        matchAdditives(p.ingredients_raw).length > 0,
    ).length;
    ultraProcessedPct = (ultra / withNutrition.length) * 100;
  }

  const flaggedAdditiveSkus = items.filter((p) =>
    matchAdditives(p.ingredients_raw).some((m) => m.tier === "moderate" || m.tier === "hazardous"),
  ).length;

  const summary: string[] = [];
  if (scores.length) {
    const avgScore = avg(scores)!;
    summary.push(`Average Core score ${avgScore.toFixed(0)} across ${scores.length} scored items.`);
  }
  if (proteinPct != null) {
    summary.push(`~${proteinPct.toFixed(0)}% of macros from protein (by 100g label averages).`);
  }
  if (avgSugarG != null) {
    summary.push(`~${avgSugarG.toFixed(1)}g sugar per 100g on average.`);
  }
  if (ultraProcessedPct != null && ultraProcessedPct > 25) {
    summary.push(
      `${ultraProcessedPct.toFixed(0)}% of items look ultra-processed (high sugar + additives, low protein).`,
    );
  } else if (ultraProcessedPct != null) {
    summary.push(`Ultra-processed share ~${ultraProcessedPct.toFixed(0)}% — moderate cart.`);
  }

  return {
    itemCount: items.length,
    totalInr,
    avgCoreScore: scores.length ? avg(scores) : null,
    proteinPct,
    avgSugarG,
    avgFiberG,
    ultraProcessedPct,
    flaggedAdditiveSkus,
    summary,
  };
}

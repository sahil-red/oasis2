import { computeGoalFit, goalFitInputs } from "@/lib/goals/fit";
import type { GoalId } from "@/lib/goals/types";
import { productAisle, productShelf } from "@/lib/products/catalog-meta";
import type { ProductListItem } from "@/lib/products/queries";
import type { ProductNutrition } from "@/lib/supabase/types";

export type SwapSuggestion = {
  product: ProductListItem;
  goalFit: number;
  deltas: string[];
};

function sugar(n: ProductNutrition | null): number | null {
  const s = n?.sugar_g_100g ?? n?.added_sugar_g_100g;
  return typeof s === "number" ? s : null;
}

function priceBand(price: number | null): number | null {
  if (price == null || price <= 0) return null;
  if (price < 80) return 1;
  if (price < 200) return 2;
  if (price < 400) return 3;
  return 4;
}

export function findAlternatives(
  current: ProductListItem,
  catalog: ProductListItem[],
  goal: GoalId,
  limit = 3,
): SwapSuggestion[] {
  const aisle = productAisle(current);
  const shelf = productShelf(current);
  const curSugar = sugar(current.nutrition);
  const curProtein = current.nutrition?.protein_g_100g ?? null;
  const curPrice = current.price_inr;
  const band = priceBand(curPrice);

  const pool = catalog.filter((p) => {
    if (p.id === current.id) return false;
    if (!p.core_scores && goal === "balanced") return false;
    if (aisle && productAisle(p) !== aisle) return false;
    if (shelf && productShelf(p) === shelf) return true;
    if (shelf) return false;
    return true;
  });

  const scored = pool
    .map((p) => {
      const goalFit = computeGoalFit(goal, goalFitInputs(p)).fit;
      const core = p.core_scores?.score ?? -1;
      const rank = goal === "balanced" ? core : goalFit;
      return { p, goalFit, rank };
    })
    .filter(({ p, rank }) => {
      const curRank =
        goal === "balanced"
          ? (current.core_scores?.score ?? -1)
          : computeGoalFit(goal, goalFitInputs(current)).fit;
      if (rank <= curRank) return false;
      if (band != null && priceBand(p.price_inr) != null) {
        if (Math.abs(priceBand(p.price_inr)! - band) > 1) return false;
      }
      return true;
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);

  return scored.map(({ p, goalFit }) => {
    const deltas: string[] = [];
    const pSugar = sugar(p.nutrition);
    const pProtein = p.nutrition?.protein_g_100g ?? null;
    if (curSugar != null && pSugar != null && pSugar < curSugar - 1) {
      deltas.push(`−${(curSugar - pSugar).toFixed(1)}g sugar / 100g`);
    }
    if (curProtein != null && pProtein != null && pProtein > curProtein + 2) {
      deltas.push(`+${(pProtein - curProtein).toFixed(1)}g protein / 100g`);
    }
    if (
      curPrice != null &&
      p.price_inr != null &&
      Math.abs(p.price_inr - curPrice) <= Math.max(30, curPrice * 0.35)
    ) {
      deltas.push(`~₹${p.price_inr} on Blinkit`);
    }
    if (deltas.length === 0 && p.core_scores) {
      deltas.push(`Core ${p.core_scores.score} vs ${current.core_scores?.score ?? "—"}`);
    }
    return { product: p, goalFit, deltas };
  });
}

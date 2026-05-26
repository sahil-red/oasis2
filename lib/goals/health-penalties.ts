import type { GoalFeatures } from "@/lib/goals/features";
import type { GoalId } from "@/lib/goals/types";
import { HAZARDOUS_HARD_CAP } from "@/lib/utils";

/** Extra penalty subtracted from raw goal fit before caps (per goal). */
export function goalHealthPenalty(goal: GoalId, f: GoalFeatures): number {
  let penalty = 0;

  penalty += f.hazardousAdditiveCount * (goal === "kids" ? 14 : 10);
  penalty += f.moderateAdditiveCount * (goal === "kids" ? 4 : 2.5);
  penalty += Math.max(0, f.additiveBurden - f.hazardousAdditiveCount * 4) * (goal === "kids" ? 3 : 2);

  if (f.transFat > 0.05) penalty += goal === "kids" ? 18 : 12;

  const sodium = f.sodium;
  if (sodium >= 1200) penalty += goal === "kids" ? 28 : 18;
  else if (sodium >= 800) penalty += goal === "kids" ? 18 : 12;
  else if (sodium >= 500) penalty += goal === "kids" ? 10 : 6;

  if (f.isSnack && f.additiveBurden >= 2 && sodium >= 400) {
    penalty += goal === "kids" ? 12 : 8;
  }

  if (
    goal === "bulk" &&
    !f.isProteinPowder &&
    f.kcal >= 350 &&
    f.protein < 15 &&
    (sodium >= 600 || f.additiveBurden >= 3)
  ) {
    penalty += 10;
  }

  if (goal === "protein-budget" && (f.isProteinSnack || f.isPuff) && f.additiveBurden >= 2) {
    penalty += 8;
  }

  return penalty;
}

/** Hard ceilings so junk food cannot rank as a top pick for a goal. */
export function applyGoalHealthCaps(goal: GoalId, fit: number, f: GoalFeatures): number {
  let capped = fit;

  if (f.hazardousAdditiveCount > 0) {
    const hazCap: Partial<Record<GoalId, number>> = {
      kids: 28,
      bulk: 38,
      gym: 52,
      "fat-loss": 45,
      diabetic: 42,
      pcos: 42,
      "protein-budget": 48,
      balanced: HAZARDOUS_HARD_CAP,
    };
    const limit = hazCap[goal];
    if (limit != null) capped = Math.min(capped, limit);
  }

  if (goal === "kids") {
    if (f.sodium >= 1200) capped = Math.min(capped, 18);
    else if (f.sodium >= 800) capped = Math.min(capped, 30);
    else if (f.sodium >= 500) capped = Math.min(capped, 45);
    if (f.additiveBurden >= 6) capped = Math.min(capped, 22);
    else if (f.additiveBurden >= 4) capped = Math.min(capped, 35);
    if (f.transFat > 0.05) capped = Math.min(capped, 25);
  } else if (goal === "bulk") {
    if (f.sodium >= 1200) capped = Math.min(capped, 32);
    else if (f.sodium >= 800) capped = Math.min(capped, 45);
    if (f.additiveBurden >= 5) capped = Math.min(capped, 40);
    if (f.isSnack && f.sodium >= 600 && f.kcal >= 300) capped = Math.min(capped, 42);
  } else if (goal === "gym") {
    if (f.sodium >= 1200) capped = Math.min(capped, 48);
    else if (f.sodium >= 800) capped = Math.min(capped, 58);
    if (f.isProteinSnack && f.additiveBurden >= 3) capped = Math.min(capped, 62);
  } else {
    if (f.sodium >= 1200) capped = Math.min(capped, 38);
    else if (f.sodium >= 800) capped = Math.min(capped, 50);
  }

  if (f.processingNotes.some((n) => /artificial/i.test(n)) && (goal === "kids" || goal === "bulk")) {
    capped = Math.min(capped, goal === "kids" ? 32 : 48);
  }

  return capped;
}

export function finalizeGoalFit(goal: GoalId, fit: number, f: GoalFeatures): number {
  if (goal === "balanced") return fit;
  if (f.isFreshProduce && f.hasNutrition) return fit;
  const penalized = fit - goalHealthPenalty(goal, f);
  return applyGoalHealthCaps(goal, penalized, f);
}

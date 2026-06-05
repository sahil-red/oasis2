import type { GoalFeatures } from "@/lib/goals/features";
import type { GoalId } from "@/lib/goals/types";
import { HAZARDOUS_HARD_CAP } from "@/lib/utils";

/** Extra penalty subtracted from raw goal fit before caps (per goal). */
export function goalHealthPenalty(goal: GoalId, f: GoalFeatures): number {
  let penalty = 0;

  penalty += f.hazardousAdditiveCount * (goal === "kids" ? 14 : goal === "parents" ? 12 : 10);
  penalty += f.moderateAdditiveCount * (goal === "kids" ? 4 : goal === "parents" ? 3 : 2.5);
  penalty +=
    Math.max(0, f.additiveBurden - f.hazardousAdditiveCount * 4) *
    (goal === "kids" ? 3 : goal === "parents" ? 2.5 : 2);

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

  const sugarLoad = Math.max(f.addedSugar, f.effectiveAddedSugar);
  if (goal === "fat-loss" && (f.isDessert || f.isSweetCategory)) {
    penalty += 12;
  }
  if ((goal === "fat-loss" || goal === "diabetic" || goal === "pcos") && sugarLoad >= 18) {
    penalty += goal === "fat-loss" ? 10 : 6;
  }

  return penalty;
}

/** Hard ceilings so junk food cannot rank as a top pick for a goal. */
export function applyGoalHealthCaps(goal: GoalId, fit: number, f: GoalFeatures): number {
  let capped = fit;

  if (f.hazardousAdditiveCount > 0) {
    const hazCap: Partial<Record<GoalId, number>> = {
      kids: 28,
      parents: 38,
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
    if (f.addedSugar >= 12) capped = Math.min(capped, 38);
    else if (f.addedSugar >= 8) capped = Math.min(capped, 52);
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
    if (f.isDessert) capped = Math.min(capped, 45);
  } else if (goal === "fat-loss") {
    const sugarLoad = Math.max(f.addedSugar, f.effectiveAddedSugar);
    if (f.isDessert || f.isSweetCategory) capped = Math.min(capped, 28);
    if (sugarLoad >= 15) capped = Math.min(capped, 32);
    if (f.kcal >= 350) capped = Math.min(capped, 35);
    if (f.sodium >= 1200) capped = Math.min(capped, 38);
    else if (f.sodium >= 800) capped = Math.min(capped, 48);
  } else if (goal === "parents") {
    if (f.addedSugar >= 12) capped = Math.min(capped, 42);
    else if (f.addedSugar >= 8) capped = Math.min(capped, 55);
    if (f.sodium >= 1200) capped = Math.min(capped, 28);
    else if (f.sodium >= 800) capped = Math.min(capped, 40);
    if (f.additiveBurden >= 5) capped = Math.min(capped, 35);
    if (f.isProteinSnack && f.additiveBurden >= 3 && (f.coreScore ?? 50) < 55) {
      capped = Math.min(capped, 52);
    }
  } else if (goal === "diabetic" || goal === "pcos") {
    const sugarLoad = Math.max(f.addedSugar, f.effectiveAddedSugar);
    if (f.isDessert) capped = Math.min(capped, 32);
    if (sugarLoad >= 20) capped = Math.min(capped, 28);
    if (f.sodium >= 1200) capped = Math.min(capped, 38);
    else if (f.sodium >= 800) capped = Math.min(capped, 48);
  } else {
    if (f.sodium >= 1200) capped = Math.min(capped, 38);
    else if (f.sodium >= 800) capped = Math.min(capped, 50);
  }

  if (f.processingNotes.some((n) => /artificial/i.test(n))) {
    if (goal === "kids") capped = Math.min(capped, 32);
    else if (goal === "parents") capped = Math.min(capped, 42);
    else if (goal === "bulk") capped = Math.min(capped, 48);
  }

  return capped;
}

export function finalizeGoalFit(goal: GoalId, fit: number, f: GoalFeatures): number {
  if (goal === "balanced") return fit;
  if (f.isFreshProduce && f.hasNutrition) return fit;
  const penalized = fit - goalHealthPenalty(goal, f);
  return applyGoalHealthCaps(goal, penalized, f);
}

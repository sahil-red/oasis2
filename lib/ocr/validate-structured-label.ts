import type { StructuredLabel } from "./lm-studio-structure";

export type LabelConfidence = "HIGH" | "LOW";

export type StructuredValidation = {
  confidence: LabelConfidence;
  score: number;
  boundaryTripped: boolean;
  calorieMath: {
    calculated: number | null;
    extracted: number | null;
    withinMargin: boolean;
    marginPct: number | null;
  };
  scoreBreakdown: string[];
};

function num(v: number | null | undefined): number | null {
  return v != null && Number.isFinite(v) ? v : null;
}

export function validateStructuredLabel(data: StructuredLabel): StructuredValidation {
  const breakdown: string[] = [];
  let score = 0;

  const protein = num(data.protein_g_100g);
  const carbs = num(data.carbs_g_100g);
  const fat = num(data.fat_g_100g);
  const sugar = num(data.sugar_g_100g);
  const calories = num(data.calories_100g);

  const boundaryTripped =
    (protein != null && protein > 100) ||
    (carbs != null && carbs > 100) ||
    (fat != null && fat > 100) ||
    (sugar != null && sugar > 100) ||
    (calories != null && calories > 900);

  if (boundaryTripped) {
    breakdown.push("boundary guardrail tripped");
  }

  let calculated: number | null = null;
  let withinMargin = false;
  let marginPct: number | null = null;

  if (protein != null && carbs != null && fat != null) {
    calculated = protein * 4 + carbs * 4 + fat * 9;
    if (calories != null && calories > 0) {
      const diff = Math.abs(calculated - calories);
      marginPct = (diff / calories) * 100;
      withinMargin = marginPct <= 20;
      if (withinMargin) {
        score += 2;
        breakdown.push(`calorie math OK (+2): calc=${calculated.toFixed(0)} vs ${calories}`);
      } else {
        breakdown.push(
          `calorie math miss (+0): calc=${calculated.toFixed(0)} vs ${calories} (${marginPct.toFixed(1)}% off)`,
        );
      }
    } else {
      breakdown.push("calorie math skipped (no calories)");
    }
  } else {
    breakdown.push("calorie math skipped (missing macros)");
  }

  if (calories != null) {
    score += 1;
    breakdown.push("calories present (+1)");
  }
  if (carbs != null) {
    score += 1;
    breakdown.push("carbs_g present (+1)");
  }
  if (protein != null) {
    score += 1;
    breakdown.push("protein_g present (+1)");
  }
  if (data.ingredients != null && data.ingredients.trim()) {
    score += 1;
    breakdown.push("ingredients present (+1)");
  }

  const confidence: LabelConfidence =
    boundaryTripped || score < 4 ? "LOW" : "HIGH";

  return {
    confidence,
    score,
    boundaryTripped,
    calorieMath: { calculated, extracted: calories, withinMargin, marginPct },
    scoreBreakdown: breakdown,
  };
}

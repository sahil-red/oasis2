import type { ProductNutrition } from "@/lib/supabase/types";

export type GlucoseFitContext = {
  nutrition: ProductNutrition;
  addedSugarG: number;
  sugarG: number;
  carbsG: number;
  fiberG: number;
  flagged: number;
  name: string;
  category: string | null;
  subcategory: string | null;
};

function isSweetSnack(name: string, category: string | null, subcategory: string | null): boolean {
  const t = `${name} ${category ?? ""} ${subcategory ?? ""}`.toLowerCase();
  if (/\b(atta|flour|dal|pulse|lentil|bean|paneer|curd|egg|oil|ghee|masala)\b/i.test(t)) {
    return false;
  }
  return /\b(choco|chocolate|wafer|confection|sweet|munch|biscuit|cookie|cereal|chocos|flakes|bar)\b/i.test(
    t,
  );
}

function isGlucoseStaple(name: string, category: string | null, subcategory: string | null): boolean {
  const t = `${name} ${category ?? ""} ${subcategory ?? ""}`.toLowerCase();
  return /\b(atta|flour|dal|pulse|rice|oil|ghee|paneer|curd|milk|diabetic|sugar control|low gi|multigrain atta)\b/i.test(
    t,
  );
}

/** Diabetic-friendly: low effective sugar + low net carbs; penalise sweet snacks. */
export function diabeticGoalFit(ctx: GlucoseFitContext): { fit: number; reasons: string[] } {
  const { addedSugarG, carbsG, fiberG, flagged, name, category, subcategory } = ctx;
  const netCarbs = Math.max(0, carbsG - fiberG);
  const reasons: string[] = [];

  let fit =
    94 -
    addedSugarG * 4.2 -
    netCarbs * 0.95 -
    Math.max(0, carbsG - 42) * 0.4 +
    Math.min(18, fiberG * 2.2) -
    flagged * 9;

  if (isSweetSnack(name, category, subcategory)) {
    fit -= 22;
    reasons.push("Sweet snack / cereal aisle — poor default for glucose control");
  }
  if (isGlucoseStaple(name, category, subcategory) && addedSugarG <= 12 && netCarbs < 58) {
    fit += 10;
    reasons.push("Staple-style food (flour / pulses) with moderate label numbers");
  }

  if (addedSugarG <= 5) reasons.push(`Low added sugar (${addedSugarG}g / 100g)`);
  else reasons.push(`${addedSugarG}g added sugar / 100g`);
  if (netCarbs >= 50) reasons.push(`~${netCarbs.toFixed(0)}g net carbs / 100g (carbs − fibre)`);
  else if (fiberG >= 4) reasons.push(`${fiberG}g fibre · ~${netCarbs.toFixed(0)}g net carbs`);

  return { fit: Math.max(0, Math.min(100, Math.round(fit))), reasons: reasons.slice(0, 3) };
}

/** PCOS mode — stricter carbs, similar snack penalties. */
export function pcosGoalFit(ctx: GlucoseFitContext): { fit: number; reasons: string[] } {
  const { addedSugarG, carbsG, fiberG, flagged, name, category, subcategory } = ctx;
  const netCarbs = Math.max(0, carbsG - fiberG);
  const carbPenalty = carbsG > 50 ? 14 : carbsG > 35 ? 7 : 0;
  const reasons: string[] = [];

  let fit =
    90 -
    addedSugarG * 4 -
    netCarbs * 0.75 -
    carbPenalty +
    Math.min(16, fiberG * 2.4) -
    flagged * 10;

  if (isSweetSnack(name, category, subcategory)) fit -= 18;
  if (isGlucoseStaple(name, category, subcategory) && addedSugarG <= 10 && netCarbs < 55) {
    fit += 8;
  }

  if (addedSugarG <= 5) reasons.push(`Low added sugar (${addedSugarG}g / 100g)`);
  else reasons.push(`${addedSugarG}g added sugar / 100g`);
  if (carbPenalty) reasons.push(`Higher total carbs (${carbsG}g / 100g)`);
  if (netCarbs >= 45) reasons.push(`~${netCarbs.toFixed(0)}g net carbs / 100g`);

  return { fit: Math.max(0, Math.min(100, Math.round(fit))), reasons: reasons.slice(0, 3) };
}

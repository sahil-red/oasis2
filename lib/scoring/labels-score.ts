import type { ProductNutrition } from "@/lib/supabase/types";

function isKidsRelevantProduct(
  category: string | null,
  subcategory: string | null,
  productName: string | null | undefined,
): boolean {
  const hay = `${category ?? ""} ${subcategory ?? ""} ${productName ?? ""}`.toLowerCase();
  return (
    /\bbaby\b|\btoddler\b|\binfant\b|\bkids?\b/i.test(hay) ||
    /baby\s*&\s*toddler/i.test(category ?? "")
  );
}

function labelSugarG(nutrition: ProductNutrition | null): number | null {
  const s = nutrition?.sugar_g_100g ?? nutrition?.added_sugar_g_100g;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

export type LabelMismatchDetail = {
  /** The marketing phrase found on the pack, e.g. `no added sugar`. */
  claim: string;
  /** What the back label actually shows, ready for display. */
  reality: string;
};

/** Same rules as detectLabelMismatch, but returns the claim + evidence so the
 *  UI can show *why* instead of a bare flag. */
export function explainLabelMismatch(
  ingredientsRaw: string | null,
  attributes: Record<string, string> | null,
  nutrition: ProductNutrition | null,
): LabelMismatchDetail | null {
  const text = [
    ingredientsRaw ?? "",
    attributes?.["Diet Preference"] ?? "",
    attributes?.["Key Features"] ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const sugar = labelSugarG(nutrition);
  const sugarClaim = text.match(/no added sugar|no hidden sugar|unsweetened|zero sugar/i);
  if (sugarClaim && (sugar ?? 0) >= 8) {
    const rounded = Math.round((sugar ?? 0) * 10) / 10;
    return {
      claim: sugarClaim[0],
      reality: `the nutrition panel shows ${rounded}g sugar per 100g`,
    };
  }
  const halo = text.match(/\b(natural|no added sugar)\b/i);
  const sweetener = (ingredientsRaw ?? "")
    .toLowerCase()
    .match(/\b(acesulfame[\s-]*k?|sucralose|aspartame|maltodextrin|corn syrup)\b/);
  if (halo && sweetener) {
    return {
      claim: halo[0],
      reality: `the ingredient list includes ${sweetener[0].trim()}`,
    };
  }
  return null;
}

/** Marketing claim contradicts panel (used for sublabel + label subscore). */
export function detectLabelMismatch(
  ingredientsRaw: string | null,
  attributes: Record<string, string> | null,
  nutrition: ProductNutrition | null,
): boolean {
  return explainLabelMismatch(ingredientsRaw, attributes, nutrition) != null;
}

/** Pack-claim audit subscore (0–10). */
export function scoreLabels(
  ingredientsRaw: string | null,
  attributes: Record<string, string> | null,
  nutrition: ProductNutrition | null,
  category: string | null,
  subcategory: string | null,
  productName: string | null | undefined,
): number {
  let score = 0;
  const text = [
    ingredientsRaw ?? "",
    attributes?.["Diet Preference"] ?? "",
    attributes?.["Key Features"] ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const sugar = labelSugarG(nutrition);
  const kids = isKidsRelevantProduct(category, subcategory, productName);
  const claimsNoAddedSugar = /no added sugar|no hidden sugar|unsweetened|zero sugar/i.test(text);

  if (/organic|jaivik|fssai organic/i.test(text)) score += 4;
  if (/no palm oil|palm oil free/i.test(text)) score += 2;
  if (claimsNoAddedSugar && (sugar ?? 0) < 8) score += 2;
  if (/no preserv|preservative[- ]?free|without preserv/i.test(text)) score += 2;
  if (/jaggery|gud\b|raw honey|multigrain|whole wheat|whole grain/i.test(text)) score += 2;

  if (detectLabelMismatch(ingredientsRaw, attributes, nutrition)) score -= 4;

  if (/\bdates?\b|\bdate powder\b/i.test(text) && kids && (sugar ?? 0) >= 8) score -= 2;

  if (kids && sugar != null) {
    if (sugar >= 12) score = Math.min(score, 2);
    else if (sugar >= 8) score = Math.min(score, 4);
  }

  return Math.max(0, Math.min(10, score));
}

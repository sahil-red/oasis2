import type { ProductListItem } from "@/lib/products/queries";
import type { ParsedHealthContext, ParsedProductQuery } from "@/lib/search/query-parse";

const ADULT_FITNESS_CONTEXTS = new Set<ParsedHealthContext>([
  "bulk",
  "gym",
  "fat_loss",
  "diabetic",
  "pcos",
]);

/** Infant / toddler SKUs — wrong for adult bulking, gym, fat-loss unless kids intent. */
export function isInfantOrBabyProduct(p: ProductListItem): boolean {
  const hay = [p.name, p.brand, p.category, p.subcategory]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    /\b(baby|infant|toddler|newborn)\b/.test(hay) ||
    /\b(cerelac|lactogen|nan pro|farex|nestum|slurrp farm cereal for little)\b/i.test(hay) ||
    /\bfollow[\s-]?on formula\b/i.test(hay) ||
    /\binfant cereal\b/i.test(hay)
  );
}

export function isPetFoodProduct(p: ProductListItem): boolean {
  const hay = [p.name, p.category, p.subcategory].filter(Boolean).join(" ").toLowerCase();
  return /\b(pet food|dog food|cat food|puppy|kitten)\b/i.test(hay);
}

/** Block baby/pet aisles when the shopper asked for an adult fitness goal. */
export function blockedForAdultHealthGoal(
  p: ProductListItem,
  parsed: ParsedProductQuery,
): boolean {
  if (parsed.health_contexts.includes("kids")) return false;
  if (!parsed.health_contexts.some((c) => ADULT_FITNESS_CONTEXTS.has(c))) return false;
  return isInfantOrBabyProduct(p) || isPetFoodProduct(p);
}

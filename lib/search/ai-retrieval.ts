import { isDietCompatible } from "@/lib/diet/match";
import { relevanceScore } from "@/lib/search/semantic-rank";
import type { ProductListItem } from "@/lib/products/queries";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { ParsedProductQuery } from "@/lib/search/query-parse";

function nutritionValue(
  nutrition: ProductNutrition | null | undefined,
  key: keyof ProductNutrition,
): number | null {
  const v = nutrition?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Objective filters only — nutrition and diet flags we can verify from data. */
export function passesHardConstraints(p: ProductListItem, parsed: ParsedProductQuery): boolean {
  const c = parsed.hard_constraints;
  const price = p.price_inr ?? p.mrp_inr;
  const sugar =
    nutritionValue(p.nutrition, "sugar_g_100g") ??
    nutritionValue(p.nutrition, "added_sugar_g_100g");
  const fat = nutritionValue(p.nutrition, "fat_g_100g");
  const protein = nutritionValue(p.nutrition, "protein_g_100g");
  const ingredients = (p.ingredients_raw ?? "").toLowerCase();

  if (c.max_price != null && price != null && price > c.max_price) return false;
  if (c.max_sugar_g_100g != null && sugar != null && sugar > c.max_sugar_g_100g) return false;
  if (c.max_fat_g_100g != null && fat != null && fat > c.max_fat_g_100g) return false;
  if (c.min_protein_g_100g != null && protein != null && protein < c.min_protein_g_100g) {
    const namedFood = parsed.product_terms.length > 0;
    if (!namedFood) return false;
  }
  if (c.vegan && !isDietCompatible("vegan", p).ok) return false;
  if (c.vegetarian && !c.vegan && !isDietCompatible("veg", p).ok) return false;
  for (const avoid of c.avoid_ingredients ?? []) {
    const a = avoid.toLowerCase();
    if (a.includes("palm") && /palm oil|palmolein|palm fat/i.test(ingredients)) return false;
    if (ingredients.includes(a)) return false;
  }
  for (const allergen of c.allergens_excluded ?? []) {
    if (ingredients.includes(allergen.toLowerCase())) return false;
  }
  const sublabels = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];
  for (const avoid of c.avoid_sublabels ?? []) {
    if (sublabels.includes(avoid)) return false;
  }
  return true;
}

/** Pull a bounded candidate set using product-type relevance + hard constraints. */
export function retrieveCandidates(
  catalog: ProductListItem[],
  parsed: ParsedProductQuery,
  maxCandidates = 100,
): ProductListItem[] {
  const scored = catalog
    .map((p) => ({ p, score: relevanceScore(p, parsed) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const strict = scored.filter(({ p }) => passesHardConstraints(p, parsed));
  const pool = strict.length >= 12 ? strict : scored;

  return pool.slice(0, maxCandidates).map(({ p }) => p);
}

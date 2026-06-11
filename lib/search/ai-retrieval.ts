import { isDietCompatible } from "@/lib/diet/match";
import { blockedForAdultHealthGoal } from "@/lib/search/audience-gate";
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

// ─────────────────────────────────────────────────────────────────────────────
// Ingredient avoidance matching
//
// Indian packaged food labels write the same ingredient many ways.
// We need broad matching for each avoid category so the filter is reliable.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if `ingredientsText` contains the ingredient that `avoidTerm` refers to.
 *
 * Uses category-aware regex so forms like "Hydrogenated Vegetable Oils (Rapeseed and Palm)"
 * are caught by avoidTerm="palm oil", even though the literal string "palm oil" is absent.
 */
export function ingredientPresent(ingredientsText: string, avoidTerm: string): boolean {
  const a = avoidTerm.toLowerCase().trim();
  const t = ingredientsText.toLowerCase();

  // Palm oil family — catches all label forms found on Indian packaged food:
  //   "Palm Oil", "Palmolein", "Palm Stearin", "Palm Kernel Oil",
  //   "Hydrogenated Vegetable Oils (Rapeseed and Palm)", "PALMOLEO FRACTION",
  //   "Vegetable Oil (Palm)", "Palm Fat", "Refined Palmolein"
  if (a.includes("palm")) {
    return /\bpalm\b(?:\s*(?:oil|kernel|stearin|fat|olein|hard))?|\bpalmolein\b|\bpalmoleo\b/i.test(t);
  }

  // Maida / refined wheat flour family
  if (a.includes("maida") || a.includes("refined wheat") || a.includes("refined flour") || a.includes("all purpose")) {
    return /\bmaida\b|\brefined\s+wheat\s+flour\b|\ball[\s-]+purpose\s+flour\b|\bwheat\s+flour\s*\(\s*refined\b/i.test(t);
  }

  // MSG family
  if (a.includes("msg") || a.includes("monosodium") || a.includes("ajinomoto")) {
    return /\bmonosodium\s+glutamate\b|\bmsg\b|\bajinomoto\b|\b(?:e|ins)\s*621\b/i.test(t);
  }

  // Aspartame
  if (a.includes("aspartame")) {
    return /\baspartame\b|\b(?:e|ins)\s*951\b/i.test(t);
  }

  // Default: word-boundary match (safer than includes for short terms)
  if (a.length >= 4) {
    return new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t);
  }
  return t.includes(a);
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
    return false;
  }
  if (c.vegan && !isDietCompatible("vegan", p).ok) return false;
  if (c.vegetarian && !c.vegan && !isDietCompatible("veg", p).ok) return false;
  for (const avoid of c.avoid_ingredients ?? []) {
    // Only filter if we have ingredient data. If ingredients_raw is empty/null,
    // we can't confirm absence — skip the hard exclude but the ranker will deprioritize.
    if (ingredients && ingredientPresent(ingredients, avoid)) return false;
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

function isGoalOnlyQuery(parsed: ParsedProductQuery): boolean {
  return (
    !parsed.product_terms.length &&
    (parsed.health_contexts.length > 0 ||
      parsed.hard_constraints.min_protein_g_100g != null ||
      parsed.sort_intent === "highest_protein" ||
      parsed.soft_preferences.some((s) => /parents|elderly/i.test(s)))
  );
}

/** When there is no product noun, score by protein density and Scout label. */
function goalOnlyRetrievalScore(p: ProductListItem, parsed: ParsedProductQuery): number {
  const protein = nutritionValue(p.nutrition, "protein_g_100g") ?? 0;
  const scout = p.core_scores?.score ?? 0;
  const minP = parsed.hard_constraints.min_protein_g_100g;
  if (minP != null && protein < minP) return 0;
  const isProteinQuery = minP != null || parsed.sort_intent === "highest_protein";
  if (isProteinQuery) {
    return protein * 6 + scout * 0.45;
  }
  return scout * 0.45;
}

/** Pull a bounded candidate set using product-type relevance + hard constraints. */
export function retrieveCandidates(
  catalog: ProductListItem[],
  parsed: ParsedProductQuery,
  maxCandidates = 100,
): ProductListItem[] {
  const goalOnly = isGoalOnlyQuery(parsed);

  const scored = catalog
    .map((p) => {
      let score = relevanceScore(p, parsed);
      if (goalOnly && score <= 0 && !blockedForAdultHealthGoal(p, parsed)) {
        score = goalOnlyRetrievalScore(p, parsed);
      }
      return { p, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const strict = scored.filter(({ p }) => passesHardConstraints(p, parsed));
  const strictThreshold = Math.max(Math.round(maxCandidates * 0.1), 3);
  const pool = strict.length >= strictThreshold ? strict : scored;

  return pool.slice(0, maxCandidates).map(({ p }) => p);
}

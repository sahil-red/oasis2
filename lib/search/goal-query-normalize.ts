import type { ParsedHealthContext, ParsedProductQuery } from "@/lib/search/query-parse";

/** Words that describe a goal, not a product type — must not gate search results. */
export const GOAL_META_PRODUCT_TERMS = new Set([
  "food",
  "foods",
  "bulking",
  "bulk",
  "gain",
  "weight",
  "fitness",
  "healthy",
  "healthiest",
  "health",
  "nutritious",
  "diet",
  "dieting",
  "calorie",
  "calories",
  "kcal",
  "snack",
  "snacks",
  "meal",
  "meals",
  "eat",
  "eating",
  "for",
  "the",
  "and",
]);

const ADULT_GOAL_CONTEXTS = new Set<ParsedHealthContext>(["bulk", "gym", "fat_loss"]);

const DEFAULT_BULK_EXCLUDES = [
  "cerelac",
  "baby food",
  "infant cereal",
  "toddler",
  "lactogen",
  "follow on",
  "pet food",
];

/** Drop meta terms like "food"/"bulking" when the query is really a health goal. */
export function stripGoalMetaProductTerms(parsed: ParsedProductQuery): void {
  const realTerms = parsed.product_terms.filter(
    (t) => !GOAL_META_PRODUCT_TERMS.has(t.toLowerCase()),
  );

  if (realTerms.length === 0 && parsed.product_terms.length > 0) {
    parsed.product_terms = [];
    parsed.search_keywords = [];
  } else if (realTerms.length !== parsed.product_terms.length) {
    parsed.product_terms = realTerms;
    parsed.search_keywords = realTerms;
  }

  if (parsed.health_contexts.some((c) => ADULT_GOAL_CONTEXTS.has(c))) {
    const existing = new Set(parsed.exclude_keywords.map((k) => k.toLowerCase()));
    for (const kw of DEFAULT_BULK_EXCLUDES) {
      if (!existing.has(kw)) parsed.exclude_keywords.push(kw);
    }
  }
}

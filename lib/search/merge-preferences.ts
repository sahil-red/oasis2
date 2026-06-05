import type { AiSearchPreferences } from "@/lib/search/ai-usage";
import type { ParsedHealthContext, ParsedProductQuery } from "@/lib/search/query-parse";

/** Apply device-saved prefs to parsed query without appending text to the search box. */
export function mergeSavedPreferences(
  parsed: ParsedProductQuery,
  prefs: AiSearchPreferences | null | undefined,
): ParsedProductQuery {
  if (!prefs || !Object.keys(prefs).length) return parsed;

  const hard = { ...parsed.hard_constraints };
  if (prefs.diet === "vegan") {
    hard.vegan = true;
    hard.vegetarian = true;
  } else if (prefs.diet === "vegetarian") {
    hard.vegetarian = true;
  }
  if (prefs.budget != null && prefs.budget > 0 && hard.max_price == null) {
    hard.max_price = prefs.budget;
  }
  const avoid = [
    ...new Set([...(hard.avoid_ingredients ?? []), ...(prefs.avoidIngredients ?? [])]),
  ];
  if (avoid.length) hard.avoid_ingredients = avoid;

  const health = [
    ...new Set([...parsed.health_contexts, ...(prefs.healthContexts ?? [])]),
  ] as ParsedHealthContext[];

  return {
    ...parsed,
    hard_constraints: hard,
    health_contexts: health,
  };
}

import type { ParsedProductQuery } from "@/lib/search/query-parse";

const AUDIENCE_WORDS = new Set([
  "parents",
  "parent",
  "elderly",
  "senior",
  "seniors",
  "mom",
  "dad",
  "mother",
  "father",
  "grandma",
  "grandpa",
  "grandparent",
]);

/** Audience phrases are never product types — strip from product_terms. */
export function applyAudienceHeuristics(parsed: ParsedProductQuery, lower: string): void {
  const forParents =
    /\b(parents?|for mom|for dad|elderly|seniors?|grandparents?|old age)\b/i.test(lower);
  const proteinAsk = /\bprotein\b/i.test(lower);

  if (forParents) {
    parsed.soft_preferences.push("for parents / elderly");
    parsed.product_terms = parsed.product_terms.filter(
      (t) => !AUDIENCE_WORDS.has(t.toLowerCase()),
    );
    parsed.search_keywords = parsed.search_keywords.filter(
      (t) => !AUDIENCE_WORDS.has(t.toLowerCase()),
    );
  }

  if (proteinAsk && !/\bprotein (powder|bar|shake|supplement)\b/i.test(lower)) {
    const onlyAudience =
      parsed.product_terms.length === 0 ||
      parsed.product_terms.every((t) => AUDIENCE_WORDS.has(t.toLowerCase()));
    if (onlyAudience || forParents) {
      if (!parsed.hard_constraints.min_protein_g_100g) {
        parsed.hard_constraints.min_protein_g_100g = forParents ? 10 : 12;
      }
      if (parsed.sort_intent === "best_match") {
        parsed.sort_intent = "highest_protein";
      }
      parsed.search_keywords = [
        ...new Set([
          ...parsed.search_keywords,
          "protein",
          "paneer",
          "milk",
          "curd",
          "dal",
          "eggs",
          "whey",
          "horlicks",
          "ensure",
          "protinex",
        ]),
      ];
      parsed.explanation = forParents
        ? "High-protein foods suited for parents / elderly."
        : "High-protein products in the catalog.";
    }
  }
}

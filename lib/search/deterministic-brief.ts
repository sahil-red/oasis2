import type { ParsedProductQuery } from "@/lib/search/query-parse";

/** Compact gate summary passed to DeepSeek ranker (from local parse only). */
export function deterministicSearchBrief(parsed: ParsedProductQuery): string {
  const lines: string[] = [];
  const c = parsed.hard_constraints;

  if (parsed.product_terms.length) {
    lines.push(`Product type (must match): ${parsed.product_terms.join(", ")}`);
  } else {
    lines.push("Product type: open — rank by constraints and goal, not keyword overlap alone.");
  }

  if (parsed.health_contexts.length) {
    lines.push(`Health goal: ${parsed.health_contexts.join(", ")}`);
  }
  lines.push(`Sort intent: ${parsed.sort_intent}`);

  const hard: string[] = [];
  if (c.max_price != null) hard.push(`max price ₹${c.max_price}`);
  if (c.max_sugar_g_100g != null) hard.push(`max sugar ${c.max_sugar_g_100g}g/100g`);
  if (c.max_fat_g_100g != null) hard.push(`max fat ${c.max_fat_g_100g}g/100g`);
  if (c.min_protein_g_100g != null) hard.push(`min protein ${c.min_protein_g_100g}g/100g`);
  if (c.vegetarian) hard.push("vegetarian");
  if (c.vegan) hard.push("vegan");
  if (c.avoid_ingredients?.length) hard.push(`avoid ingredients: ${c.avoid_ingredients.join(", ")}`);
  if (c.avoid_sublabels?.length) hard.push(`avoid labels: ${c.avoid_sublabels.join(", ")}`);
  lines.push(`Hard gates: ${hard.length ? hard.join("; ") : "none"}`);

  if (parsed.soft_preferences.length) {
    lines.push(`Soft preferences: ${parsed.soft_preferences.join("; ")}`);
  }
  if (parsed.exclude_keywords.length) {
    lines.push(`Exclude product types: ${parsed.exclude_keywords.join(", ")}`);
  }
  if (parsed.l3_block_patterns?.length) {
    lines.push(`L3 block patterns: ${parsed.l3_block_patterns.length} rules active`);
  }

  return lines.join("\n");
}

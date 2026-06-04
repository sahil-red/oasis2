import { isDietCompatible } from "@/lib/diet/match";
import { computeGoalFit, goalFitInputs } from "@/lib/goals/fit";
import type { GoalId } from "@/lib/goals/types";
import { productAisle, productShelf, productUsecase } from "@/lib/products/catalog-meta";
import { getAiSearchProductPool, type CatalogGridItem, type ProductListItem } from "@/lib/products/queries";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { ParsedHealthContext, ParsedProductQuery, QueryParseResult } from "@/lib/search/query-parse";

export type AiSearchItem = CatalogGridItem & {
  ai_match_score: number;
  ai_match_reasons: string[];
  ai_match_warning?: string | null;
};

export type AiSearchResult = {
  parsed: ParsedProductQuery;
  parse_source: QueryParseResult["source"];
  parse_warning?: string;
  summary: string;
  items: AiSearchItem[];
  reasons_by_product_id: Record<string, string[]>;
  refinements: string[];
  usage?: QueryParseResult["usage"];
  limit: number;
  total: number;
  relaxed: boolean;
};

type RankedCandidate = {
  product: ProductListItem;
  score: number;
  reasons: string[];
  warning: string | null;
  hardFailures: number;
};

const CONTEXT_TO_GOAL: Record<ParsedHealthContext, GoalId> = {
  diabetic: "diabetic",
  pcos: "pcos",
  kids: "kids",
  gym: "gym",
  fat_loss: "fat-loss",
  bulk: "bulk",
};

function value(nutrition: ProductNutrition | null | undefined, key: keyof ProductNutrition): number | null {
  const v = nutrition?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function priceOf(p: ProductListItem): number | null {
  return p.price_inr ?? p.mrp_inr ?? null;
}

function textHaystack(p: ProductListItem): string {
  return [
    p.name,
    p.brand,
    productAisle(p),
    productShelf(p),
    productUsecase(p),
    p.net_weight,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary match — prevents "milk" from matching "milky" or "milkshake brand names". */
function wordMatch(hay: string, term: string): boolean {
  return new RegExp(`\\b${escapeRe(term.toLowerCase())}\\b`, "i").test(hay);
}

function includesAny(hay: string, terms: string[]): boolean {
  return terms.some((term) => wordMatch(hay, term));
}

/**
 * Returns true when the term appears only as a modifier/ingredient in the product name
 * (e.g. "Coconut Milk" in "Kerala Fish Curry With Coconut Milk" or
 *  "Milk Chocolate" coating on an otherwise non-milk product).
 * In these cases the product shouldn't rank as a primary match.
 */
function termIsIngredientMention(name: string, term: string): boolean {
  const lower = name.toLowerCase();
  const t = term.toLowerCase();
  if (!wordMatch(lower, t)) return false;
  // Term appears after a preposition → likely an ingredient, not the primary product
  return new RegExp(`\\b(with|in|of|and|flavou?red?|coated?|filled?|made with)\\s+(?:\\w+\\s+){0,3}${escapeRe(t)}\\b`, "i").test(lower);
}

function productTermScore(p: ProductListItem, parsed: ParsedProductQuery): { score: number; reasons: string[] } {
  const hay = textHaystack(p);
  const nameOnly = (p.name ?? "").toLowerCase();
  const primaryHay = [p.name, p.brand].filter(Boolean).join(" ").toLowerCase();
  const terms = parsed.product_terms.map((t) => t.toLowerCase()).filter(Boolean);
  const categories = parsed.categories.map((t) => t.toLowerCase()).filter(Boolean);
  let score = 0;
  const reasons: string[] = [];

  // Word-boundary match on name/brand — prevents "milky" matching "milk"
  const primaryMatches = terms.filter((term) => wordMatch(primaryHay, term));
  // Penalise terms that appear only as ingredient/modifier mentions
  const ingredientOnly = primaryMatches.filter((term) => termIsIngredientMention(nameOnly, term));
  const trueMatches = primaryMatches.filter((term) => !ingredientOnly.includes(term));

  const contextMatches = terms.filter((term) => !wordMatch(primaryHay, term) && wordMatch(hay, term));

  if (trueMatches.length) {
    score += 42 + Math.min(24, trueMatches.length * 8);
    reasons.push(`Matches ${trueMatches.slice(0, 2).join(", ")}`);
  } else if (ingredientOnly.length) {
    // Term is in the name but as a "with X" ingredient mention — much lower score
    score += 10;
    reasons.push(`Contains ${ingredientOnly.slice(0, 1).join(", ")}`);
  } else if (contextMatches.length) {
    score += 14 + Math.min(12, contextMatches.length * 4);
    reasons.push(`Right aisle`);
  }
  if (categories.length && includesAny(hay, categories)) {
    score += 10;
    reasons.push("Right aisle");
  }
  if (!terms.length && !categories.length) {
    score += 8;
  }
  return { score, reasons };
}

function constraintScore(p: ProductListItem, parsed: ParsedProductQuery): {
  score: number;
  reasons: string[];
  failures: string[];
} {
  const c = parsed.hard_constraints;
  const reasons: string[] = [];
  const failures: string[] = [];
  let score = 0;
  const price = priceOf(p);
  const sugar = value(p.nutrition, "sugar_g_100g") ?? value(p.nutrition, "added_sugar_g_100g");
  const fat = value(p.nutrition, "fat_g_100g");
  const protein = value(p.nutrition, "protein_g_100g");
  const ingredients = (p.ingredients_raw ?? "").toLowerCase();

  if (c.max_price != null) {
    if (price != null && price <= c.max_price) {
      score += 12;
      reasons.push(`Under ₹${c.max_price}`);
    } else {
      failures.push(`over ₹${c.max_price}`);
      score -= 22;
    }
  }
  if (c.max_sugar_g_100g != null) {
    if (sugar != null && sugar <= c.max_sugar_g_100g) {
      score += 16;
      reasons.push(`Sugar ${sugar}g/100g`);
    } else {
      failures.push(`above ${c.max_sugar_g_100g}g sugar`);
      score -= 28;
    }
  }
  if (c.max_fat_g_100g != null) {
    if (fat != null && fat <= c.max_fat_g_100g) {
      score += 10;
      reasons.push(`Fat ${fat}g/100g`);
    } else {
      failures.push(`above ${c.max_fat_g_100g}g fat`);
      score -= 16;
    }
  }
  if (c.min_protein_g_100g != null) {
    if (protein != null && protein >= c.min_protein_g_100g) {
      score += 18;
      reasons.push(`Protein ${protein}g/100g`);
    } else {
      failures.push(`below ${c.min_protein_g_100g}g protein`);
      score -= 22;
    }
  }
  if (c.vegetarian) {
    const diet = isDietCompatible("veg", p);
    if (diet.ok) {
      score += 8;
      reasons.push("Vegetarian-compatible");
    } else {
      failures.push(diet.reason ?? "not vegetarian");
      score -= 30;
    }
  }
  for (const avoid of c.avoid_ingredients ?? []) {
    if (ingredients.includes(avoid.toLowerCase())) {
      failures.push(`contains ${avoid}`);
      score -= 24;
    } else if (ingredients) {
      score += 4;
    }
  }
  for (const allergen of c.allergens_excluded ?? []) {
    if (ingredients.includes(allergen.toLowerCase())) {
      failures.push(`mentions ${allergen}`);
      score -= 28;
    }
  }
  const sublabels = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];
  for (const avoid of c.avoid_sublabels ?? []) {
    if (sublabels.includes(avoid)) {
      failures.push(avoid.replace(/_/g, " "));
      score -= 32;
    } else {
      score += 6;
      reasons.push(`No ${avoid.replace(/_/g, " ")}`);
    }
  }

  return { score, reasons, failures };
}

function goalScore(p: ProductListItem, parsed: ParsedProductQuery): { score: number; reasons: string[] } {
  const goals = parsed.health_contexts.map((c) => CONTEXT_TO_GOAL[c]).filter(Boolean);
  if (!goals.length) return { score: 0, reasons: [] };
  const fits = goals.map((goal) => ({
    goal,
    result: computeGoalFit(goal, goalFitInputs(p)),
  }));
  const best = fits.sort((a, b) => b.result.fit - a.result.fit)[0];
  if (!best) return { score: 0, reasons: [] };
  return {
    score: Math.round(best.result.fit * 0.35),
    reasons: [best.result.shortReason],
  };
}

function sortIntentBonus(p: ProductListItem, parsed: ParsedProductQuery): number {
  const core = p.core_scores?.score ?? 0;
  const price = priceOf(p) ?? 9999;
  const protein = value(p.nutrition, "protein_g_100g") ?? 0;
  switch (parsed.sort_intent) {
    case "healthiest":
      return core * 0.25;
    case "cheapest":
      return Math.max(0, 20 - price / 12);
    case "highest_protein":
      return Math.min(28, protein * 1.6);
    default:
      return core * 0.12;
  }
}

function formatPenalty(p: ProductListItem, parsed: ParsedProductQuery): { penalty: number; reason: string | null } {
  const terms = parsed.product_terms.map((t) => t.toLowerCase());
  const name = p.name.toLowerCase();
  const wantsBaseFood = terms.some((t) => /paneer|milk|curd|yogurt|oats|biscuit|chips|bread|cereal/.test(t));
  if (wantsBaseFood && /\b(spice mix|masala|seasoning|premix|instant mix)\b/.test(name)) {
    return { penalty: 26, reason: "Looks like a mix, not the base food" };
  }
  return { penalty: 0, reason: null };
}

function rankProduct(p: ProductListItem, parsed: ParsedProductQuery): RankedCandidate {
  const term = productTermScore(p, parsed);
  const constraint = constraintScore(p, parsed);
  const goal = goalScore(p, parsed);
  const core = p.core_scores?.score ?? 0;
  const failures = constraint.failures;
  const format = formatPenalty(p, parsed);
  const score =
    term.score +
    constraint.score +
    goal.score +
    sortIntentBonus(p, parsed) +
    Math.min(15, core * 0.15) -
    format.penalty;

  const reasons = [...term.reasons, ...constraint.reasons, ...goal.reasons]
    .filter(Boolean)
    .slice(0, 4);

  return {
    product: p,
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: reasons.length ? reasons : ["Closest available match"],
    warning: failures.length
      ? `Relaxed: ${failures.slice(0, 2).join(", ")}`
      : format.reason,
    hardFailures: failures.length,
  };
}

function toAiGridItem(candidate: RankedCandidate): AiSearchItem {
  const p = candidate.product;
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category,
    subcategory: p.subcategory,
    net_weight: p.net_weight,
    price_inr: p.price_inr,
    mrp_inr: p.mrp_inr,
    image_urls: p.image_urls?.length ? [p.image_urls[0]] : [],
    core_scores: p.core_scores
      ? {
          score: p.core_scores.score,
          grade: p.core_scores.grade,
          band: p.core_scores.band,
          verdict: p.core_scores.verdict ?? null,
          verdict_sublabels: p.core_scores.verdict_sublabels ?? [],
          relative_score: p.core_scores.relative_score ?? null,
          cohort_size: p.core_scores.cohort_size ?? null,
        }
      : null,
    ai_match_score: candidate.score,
    ai_match_reasons: candidate.reasons,
    ai_match_warning: candidate.warning,
  };
}

function summaryFor(parsed: ParsedProductQuery, ranked: RankedCandidate[], relaxed: boolean): string {
  if (!ranked.length) return "I could not find matching products in the current catalog.";
  const top = ranked[0];
  const intent = parsed.explanation.replace(/\.$/, "");
  if (relaxed) {
    return `${intent}. Exact matches were limited, so I included the closest options and marked trade-offs.`;
  }
  return `${intent}. Ranked by fit to your prompt, then Scout health score.`;
}

function suggestedRefinements(parsed: ParsedProductQuery): string[] {
  const out: string[] = [];
  if (!parsed.hard_constraints.max_price) out.push("Add a budget, e.g. under ₹150");
  if (!parsed.hard_constraints.max_sugar_g_100g) out.push("Add a sugar limit");
  if (!parsed.health_contexts.length) out.push("Add a goal like diabetic, kids, gym, or fat loss");
  if (!parsed.hard_constraints.vegetarian) out.push("Specify vegetarian or vegan if needed");
  return out.slice(0, 3);
}

export async function runAiProductSearch(
  parseResult: QueryParseResult,
  opts: { limit?: number } = {},
): Promise<AiSearchResult> {
  const limit = Math.min(40, Math.max(4, opts.limit ?? 24));
  const parsed = parseResult.parsed;
  const products = await getAiSearchProductPool();
  const terms = [...parsed.product_terms, ...parsed.categories].map((t) => t.toLowerCase());
  // Word-boundary pre-filter: prevents "milky" matching "milk", "coconut milk" dominating, etc.
  const prefiltered = terms.length
    ? products.filter((p) => includesAny(textHaystack(p), terms))
    : products;
  const pool = prefiltered.length >= 8 ? prefiltered : products;
  const rankedAll = pool
    .map((p) => rankProduct(p, parsed))
    .filter((c) => c.score > 0)
    .sort((a, b) => {
      const failureDelta = a.hardFailures - b.hardFailures;
      if (failureDelta !== 0) return failureDelta;
      return b.score - a.score;
    });

  const strict = rankedAll.filter((c) => c.hardFailures === 0);
  const relaxed = strict.length < Math.min(6, limit);
  const ranked = (relaxed ? rankedAll : strict).slice(0, limit);
  const items = ranked.map(toAiGridItem);

  return {
    parsed,
    parse_source: parseResult.source,
    parse_warning: parseResult.warning,
    summary: summaryFor(parsed, ranked, relaxed),
    items,
    reasons_by_product_id: Object.fromEntries(ranked.map((c) => [c.product.id, c.reasons])),
    refinements: suggestedRefinements(parsed),
    usage: parseResult.usage,
    limit,
    total: rankedAll.length,
    relaxed,
  };
}

import { matchAdditives } from "@/lib/scoring/rules";
import { insCodesFromText } from "@/lib/scoring/intelligence-row-resolve";
import type { ProductListItem } from "@/lib/products/queries";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { ParsedProductQuery } from "@/lib/search/query-parse";
import { passesHardConstraints } from "@/lib/search/ai-retrieval";
import type { LlmRankedItem } from "@/lib/search/ai-rank";

function nutritionValue(
  nutrition: ProductNutrition | null | undefined,
  key: keyof ProductNutrition,
): number | null {
  const v = nutrition?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function haystack(p: ProductListItem): string {
  return [p.name, p.brand, p.subcategory, p.category, p.ingredients_raw]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesKeyword(hay: string, kw: string): boolean {
  const k = kw.toLowerCase().trim();
  if (!k) return false;
  if (k.includes(" ")) return hay.includes(k);
  return new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(hay);
}

function ingredientMentionOnly(hay: string, term: string): boolean {
  const t = term.toLowerCase();
  if (!matchesKeyword(hay, t)) return false;
  const name = hay.split(",")[0] ?? hay;
  if (matchesKeyword(name, t)) return false;
  return /(?:with|contains|in|made with|using)\b/.test(hay) && hay.includes(t);
}

/** Name/subcategory patterns that mean the keyword is a flavor, not the product type. */
const TERM_FALSE_POSITIVE: Record<string, RegExp[]> = {
  paneer: [
    /\bmasala\b/i,
    /\bmarinade\b/i,
    /\bspice\b/i,
    /\bseasoning\b/i,
    /\bsoda\b/i,
    /\bgoli\b/i,
    /\bpop\b/i,
    /\bbread\b/i,
    /\bpav\b/i,
    /\bbhaji\b/i,
    /\bmix\b/i,
    /\bsorbet\b/i,
    /\bbiscuit\b/i,
    /\bcracker\b/i,
  ],
  ghee: [/\bladdu\b/i, /\bladoo\b/i, /\bbarfi\b/i, /\bmitai\b/i, /\bnamkeen\b/i, /\bbiscuit\b/i],
};

function isFalsePositiveForTerm(p: ProductListItem, term: string): boolean {
  const patterns = TERM_FALSE_POSITIVE[term.toLowerCase()];
  if (!patterns?.length) return false;
  const label = `${p.name ?? ""} ${p.subcategory ?? ""}`;
  return patterns.some((re) => re.test(label));
}

/** Product-type relevance for retrieval — Scout score must not dominate. */
export function relevanceScore(p: ProductListItem, parsed: ParsedProductQuery): number {
  const hay = haystack(p);
  for (const ex of parsed.exclude_keywords) {
    if (matchesKeyword(hay, ex)) return -1000;
  }

  let score = 0;
  const terms = [
    ...parsed.product_terms,
    ...parsed.search_keywords,
    ...parsed.categories,
  ];

  for (const term of terms) {
    const t = term.toLowerCase();
    if (!t) continue;
    if (parsed.product_terms.includes(t) && isFalsePositiveForTerm(p, t)) {
      score -= 1000;
      continue;
    }
    if (p.subcategory && matchesKeyword(p.subcategory.toLowerCase(), t)) {
      score += parsed.product_terms.includes(t) ? 72 : 60;
    } else if (matchesKeyword((p.name ?? "").toLowerCase(), t) || matchesKeyword((p.brand ?? "").toLowerCase(), t)) {
      score += parsed.product_terms.includes(t) ? 48 : 42;
    } else if (ingredientMentionOnly(hay, t)) score += 8;
    else if (hay.includes(t)) score += 10;
    else if (p.category && matchesKeyword(p.category.toLowerCase(), t)) score += 10;
  }

  score += Math.min(12, (p.core_scores?.score ?? 0) * 0.02);
  return score;
}

type PreservativeStatus = "clean" | "has" | "unknown";

function preservativeStatus(ingredients: string | null): PreservativeStatus {
  if (!ingredients?.trim()) return "unknown";
  const text = ingredients.toLowerCase();
  if (/\bpreserv/i.test(text)) return "has";
  const codes = insCodesFromText(text);
  if (codes.some((c) => {
    const n = Number(c.replace(/\D/g, ""));
    return n >= 200 && n <= 299;
  })) {
    return "has";
  }
  const hits = matchAdditives(ingredients);
  if (hits.some((h) => h.tier === "moderate" || h.tier === "hazardous")) return "has";
  return "clean";
}

function wantsNoPreservatives(parsed: ParsedProductQuery): boolean {
  const q = [
    ...parsed.soft_preferences,
    parsed.explanation,
    ...parsed.product_terms,
  ]
    .join(" ")
    .toLowerCase();
  return /\bno preserv|without preserv|preservative.?free\b/.test(q);
}

function wantsNoAddedSugar(parsed: ParsedProductQuery): boolean {
  const q = parsed.explanation.toLowerCase();
  return (
    /\bno added sugar\b/.test(q) ||
    parsed.hard_constraints.max_sugar_g_100g === 1 ||
    parsed.soft_preferences.some((s) => /no added sugar/i.test(s))
  );
}

export function passesSemanticConstraints(
  p: ProductListItem,
  parsed: ParsedProductQuery,
  mode: "strict" | "relaxed",
): boolean {
  if (!passesHardConstraints(p, parsed)) return false;

  if (mode === "relaxed") return true;

  if (wantsNoAddedSugar(parsed)) {
    const added = nutritionValue(p.nutrition, "added_sugar_g_100g");
    const subs = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];
    if (added != null && added > 0.5) return false;
    if (subs.includes("high_sugar") || subs.includes("hidden_sweetener")) return false;
  }

  if (wantsNoPreservatives(parsed)) {
    const status = preservativeStatus(p.ingredients_raw);
    if (status === "has") return false;
  }

  for (const avoid of parsed.hard_constraints.avoid_ingredients ?? []) {
    const a = avoid.toLowerCase();
    if (a.includes("maida") && /maida|refined wheat flour/i.test(p.ingredients_raw ?? "")) {
      return false;
    }
  }

  return true;
}

function sortKey(p: ProductListItem, parsed: ParsedProductQuery, relevance: number): number[] {
  const n = p.nutrition;
  const protein = nutritionValue(n, "protein_g_100g");
  const sugar =
    nutritionValue(n, "sugar_g_100g") ?? nutritionValue(n, "added_sugar_g_100g");
  const price = p.price_inr ?? p.mrp_inr ?? 999999;
  const scout = p.core_scores?.score ?? 0;

  switch (parsed.sort_intent) {
    case "highest_protein":
      return [relevance, protein ?? -1, scout];
    case "cheapest":
      return [relevance, price === 999999 ? -1 : -price, scout];
    case "healthiest":
      return [relevance, scout, protein ?? 0];
    case "best_match":
    default:
      if (parsed.hard_constraints.max_sugar_g_100g != null) {
        return [relevance, sugar != null ? -sugar : -1, scout];
      }
      return [relevance, scout, protein ?? 0];
  }
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function deterministicReasons(p: ProductListItem, parsed: ParsedProductQuery): string[] {
  const reasons: string[] = [];
  const n = p.nutrition;
  const protein = nutritionValue(n, "protein_g_100g");
  const sugar =
    nutritionValue(n, "sugar_g_100g") ?? nutritionValue(n, "added_sugar_g_100g");
  const price = p.price_inr ?? p.mrp_inr;

  if (parsed.sort_intent === "highest_protein" && protein != null) {
    reasons.push(`${Math.round(protein)}g protein per 100g`);
  }
  if (parsed.hard_constraints.max_sugar_g_100g != null && sugar != null) {
    reasons.push(
      parsed.hard_constraints.max_sugar_g_100g <= 1
        ? "No added sugar on label"
        : `${sugar}g sugar per 100g`,
    );
  }
  if (parsed.hard_constraints.max_price != null && price != null) {
    reasons.push(`₹${Math.round(price)} — under ₹${parsed.hard_constraints.max_price}`);
  }
  if (wantsNoPreservatives(parsed)) {
    const status = preservativeStatus(p.ingredients_raw);
    if (status === "clean") reasons.push("No preservatives on label");
    else if (status === "unknown") reasons.push("Preservative status not confirmed");
  }
  if (p.subcategory) reasons.push(p.subcategory);
  else if (parsed.product_terms[0]) reasons.push(parsed.product_terms[0]);

  if (!reasons.length && p.core_scores?.score != null) {
    reasons.push(`Scout score ${Math.round(p.core_scores.score)}`);
  }
  return reasons.slice(0, 3);
}

export type SemanticRankResult = {
  rankings: LlmRankedItem[];
  summary: string;
  relaxed: boolean;
};

export function rankCandidatesSemantically(
  candidates: ProductListItem[],
  parsed: ParsedProductQuery,
  limit: number,
): SemanticRankResult {
  const scored = candidates
    .map((p) => ({ p, relevance: relevanceScore(p, parsed) }))
    .filter(({ relevance }) => relevance > 0);

  const strict = scored.filter(({ p }) => passesSemanticConstraints(p, parsed, "strict"));
  const relaxed = scored.filter(({ p }) => passesSemanticConstraints(p, parsed, "relaxed"));

  const useRelaxed = strict.length < Math.min(8, limit);
  const pool = useRelaxed ? relaxed : strict;

  const ordered = pool
    .sort((a, b) => compareKeys(sortKey(a.p, parsed, a.relevance), sortKey(b.p, parsed, b.relevance)))
    .slice(0, limit);

  const rankings: LlmRankedItem[] = ordered.map(({ p, relevance }) => ({
    product_id: p.id,
    score: Math.min(100, Math.round(relevance + (p.core_scores?.score ?? 0) * 0.15)),
    reasons: deterministicReasons(p, parsed),
    warning: useRelaxed && !passesSemanticConstraints(p, parsed, "strict") ? "Close match" : null,
  }));

  const summary = useRelaxed
    ? `Few exact matches for "${parsed.product_terms.join(" ") || "your request"}" — showing close options.`
    : parsed.explanation;

  return { rankings, summary, relaxed: useRelaxed };
}

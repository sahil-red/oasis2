import { matchAdditives } from "@/lib/scoring/rules";
import { insCodesFromText } from "@/lib/scoring/intelligence-row-resolve";
import type { ProductListItem } from "@/lib/products/queries";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { ParsedProductQuery } from "@/lib/search/query-parse";
import { passesHardConstraints } from "@/lib/search/ai-retrieval";
import { passesNoAddedSugarRule } from "@/lib/search/added-sugar-scan";
import {
  l3IntentRelevanceBoost,
  passesL3IntentGate,
} from "@/lib/search/l3-category-intent";
import { productUsecase } from "@/lib/products/catalog-meta";
import { isFalsePositiveProductLabel } from "@/lib/search/product-term-heuristics";
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

function passesPrimaryTypeGate(p: ProductListItem, parsed: ParsedProductQuery): boolean {
  if (!parsed.product_terms.length) return true;

  const name = p.name ?? "";
  if (
    parsed.product_terms.some((t) =>
      isFalsePositiveProductLabel(name, p.subcategory, t),
    )
  ) {
    return false;
  }

  const l3 = productUsecase(p);
  if (l3?.trim()) {
    if (passesL3IntentGate(p, parsed)) return true;
  }

  const label = `${name} ${p.subcategory ?? ""}`;
  return parsed.product_terms.some((t) => {
    const tl = t.toLowerCase();
    return (
      matchesKeyword(label, tl) ||
      Boolean(p.subcategory && matchesKeyword(p.subcategory.toLowerCase(), tl))
    );
  });
}

/** Name / shelf / L3 only — omit L1 aisle strings like "Dairy, Bread & Eggs". */
function productTypeHaystack(p: ProductListItem): string {
  return [p.name, p.brand, p.subcategory, productUsecase(p)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function relevanceScore(p: ProductListItem, parsed: ParsedProductQuery): number {
  const hay = haystack(p);
  const typeHay = productTypeHaystack(p);
  for (const ex of parsed.exclude_keywords) {
    if (matchesKeyword(typeHay, ex)) return -1000;
  }

  if (!passesPrimaryTypeGate(p, parsed)) return 0;

  let score = 0;
  const terms = [
    ...parsed.product_terms,
    ...parsed.search_keywords,
    ...(parsed.product_terms.length ? [] : parsed.categories),
  ];

  for (const term of terms) {
    const t = term.toLowerCase();
    if (!t) continue;
    if (
      parsed.product_terms.some((pt) => pt.toLowerCase() === t) &&
      isFalsePositiveProductLabel(p.name ?? "", p.subcategory, t)
    ) {
      score -= 1000;
      continue;
    }
    const l3 = (productUsecase(p) ?? "").toLowerCase();
    if (l3 && matchesKeyword(l3, t)) {
      score += parsed.product_terms.some((pt) => pt.toLowerCase() === t) ? 80 : 65;
    } else if (p.subcategory && matchesKeyword(p.subcategory.toLowerCase(), t)) {
      score += parsed.product_terms.some((pt) => pt.toLowerCase() === t) ? 72 : 60;
    } else if (matchesKeyword((p.name ?? "").toLowerCase(), t) || matchesKeyword((p.brand ?? "").toLowerCase(), t)) {
      score += parsed.product_terms.some((pt) => pt.toLowerCase() === t) ? 48 : 42;
    } else if (ingredientMentionOnly(hay, t)) score += 8;
    else if (hay.includes(t)) score += 10;
    else if (p.category && matchesKeyword(p.category.toLowerCase(), t)) score += 10;
  }

  score += l3IntentRelevanceBoost(p, parsed);
  score += Math.min(12, (p.core_scores?.score ?? 0) * 0.02);
  return score;
}

export type PreservativeStatus = "clean" | "has" | "unknown";

export function preservativeStatus(ingredients: string | null): PreservativeStatus {
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

function preservativeSortTier(status: PreservativeStatus): number {
  if (status === "clean") return 2;
  if (status === "unknown") return 1;
  return 0;
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

export function wantsNoAddedSugar(parsed: ParsedProductQuery): boolean {
  const blob = [
    parsed.explanation,
    ...parsed.soft_preferences,
    ...parsed.product_terms,
  ]
    .join(" ")
    .toLowerCase();
  return (
    /\bno added sugar\b/.test(blob) ||
    parsed.hard_constraints.max_sugar_g_100g === 1 ||
    parsed.soft_preferences.some((s) => /no added sugar/i.test(s))
  );
}

function passesHardConstraintsForMode(
  p: ProductListItem,
  parsed: ParsedProductQuery,
  mode: "strict" | "relaxed",
): boolean {
  if (mode === "relaxed" && parsed.hard_constraints.max_price != null) {
    const { max_price: _drop, ...rest } = parsed.hard_constraints;
    return passesHardConstraints(p, { ...parsed, hard_constraints: rest });
  }
  return passesHardConstraints(p, parsed);
}

export function passesSemanticConstraints(
  p: ProductListItem,
  parsed: ParsedProductQuery,
  mode: "strict" | "relaxed",
): boolean {
  if (!passesHardConstraintsForMode(p, parsed, mode)) return false;

  if (mode === "relaxed") return true;

  if (wantsNoAddedSugar(parsed)) {
    const added = nutritionValue(p.nutrition, "added_sugar_g_100g");
    const subs = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];
    if (
      !passesNoAddedSugarRule({
        ingredients_raw: p.ingredients_raw,
        added_sugar_g_100g: added,
        verdict_sublabels: subs,
      })
    ) {
      return false;
    }
  }

  if (wantsNoPreservatives(parsed)) {
    if (preservativeStatus(p.ingredients_raw) === "has") return false;
  }

  for (const avoid of parsed.hard_constraints.avoid_ingredients ?? []) {
    const a = avoid.toLowerCase();
    const ing = (p.ingredients_raw ?? "").toLowerCase();
    if (a.includes("maida") && /maida|refined wheat flour/i.test(ing)) return false;
    if (a.includes("palm") && /palm oil|palmolein|palm fat/i.test(ing)) return false;
    if (ing.includes(a)) return false;
  }

  return true;
}

function healthContextSortBoost(p: ProductListItem, parsed: ParsedProductQuery): number {
  const ctx = parsed.health_contexts;
  if (!ctx.includes("diabetic") && !ctx.includes("pcos")) return 0;
  const subs = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];
  let boost = 0;
  if (subs.includes("hidden_sweetener")) boost -= 25;
  const sugar =
    nutritionValue(p.nutrition, "sugar_g_100g") ??
    nutritionValue(p.nutrition, "added_sugar_g_100g");
  if (sugar != null && sugar <= 10) boost += 12;
  else if (sugar != null && sugar > 15) boost -= 8;
  return boost;
}

function sortKey(
  p: ProductListItem,
  parsed: ParsedProductQuery,
  relevance: number,
  strictMatch: boolean,
): number[] {
  const n = p.nutrition;
  const protein = nutritionValue(n, "protein_g_100g");
  const sugar =
    nutritionValue(n, "sugar_g_100g") ?? nutritionValue(n, "added_sugar_g_100g");
  const fat = nutritionValue(n, "fat_g_100g");
  const price = p.price_inr ?? p.mrp_inr ?? 999999;
  const scout = p.core_scores?.score ?? 0;
  const healthBoost = healthContextSortBoost(p, parsed);

  const preservTier = wantsNoPreservatives(parsed)
    ? preservativeSortTier(preservativeStatus(p.ingredients_raw))
    : 0;

  const strictTier = strictMatch ? 1 : 0;

  switch (parsed.sort_intent) {
    case "highest_protein":
      return [strictTier, relevance, protein ?? -1, healthBoost, scout];
    case "cheapest":
      return [strictTier, relevance, price === 999999 ? -1 : -price, healthBoost, scout];
    case "healthiest":
      return [strictTier, relevance, scout, healthBoost, protein ?? 0];
    case "best_match":
    default:
      if (parsed.hard_constraints.max_fat_g_100g != null) {
        return [strictTier, relevance, preservTier, fat != null ? -fat : -1, healthBoost, scout];
      }
      if (parsed.hard_constraints.max_sugar_g_100g != null) {
        return [strictTier, relevance, preservTier, sugar != null ? -sugar : -1, healthBoost, scout];
      }
      return [strictTier, relevance, preservTier, healthBoost, scout, protein ?? 0];
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
  const fat = nutritionValue(n, "fat_g_100g");
  const price = p.price_inr ?? p.mrp_inr;

  if (parsed.sort_intent === "highest_protein" && protein != null) {
    reasons.push(`${Math.round(protein)}g protein per 100g`);
  }
  if (parsed.hard_constraints.max_fat_g_100g != null && fat != null) {
    reasons.push(`${fat}g fat per 100g`);
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
  if (parsed.hard_constraints.vegan) reasons.push("Plant-based / vegan");
  const l3 = productUsecase(p);
  if (l3) reasons.push(l3);
  else if (p.subcategory) reasons.push(p.subcategory);
  else if (parsed.product_terms[0]) reasons.push(parsed.product_terms[0]);

  if (!reasons.length && p.core_scores?.score != null) {
    reasons.push(`Scout score ${Math.round(p.core_scores.score)}`);
  }
  return reasons.slice(0, 3);
}

function sortScored(
  rows: Array<{ p: ProductListItem; relevance: number; strict: boolean }>,
  parsed: ParsedProductQuery,
): Array<{ p: ProductListItem; relevance: number; strict: boolean }> {
  return [...rows].sort((a, b) =>
    compareKeys(
      sortKey(a.p, parsed, a.relevance, a.strict),
      sortKey(b.p, parsed, b.relevance, b.strict),
    ),
  );
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

  const withStrict = scored.map(({ p, relevance }) => ({
    p,
    relevance,
    strict: passesSemanticConstraints(p, parsed, "strict"),
  }));

  const strict = withStrict.filter((r) => r.strict);
  const relaxedOnly = withStrict.filter(
    (r) => !r.strict && passesSemanticConstraints(r.p, parsed, "relaxed"),
  );

  const minStrict = Math.min(8, limit);
  const useRelaxed = strict.length < minStrict;
  const ordered = [
    ...sortScored(strict, parsed),
    ...(useRelaxed ? sortScored(relaxedOnly, parsed) : []),
  ].slice(0, limit);

  const rankings: LlmRankedItem[] = ordered.map(({ p, relevance, strict: isStrict }) => ({
    product_id: p.id,
    score: Math.min(100, Math.round(relevance + (p.core_scores?.score ?? 0) * 0.15)),
    reasons: deterministicReasons(p, parsed),
    warning:
      useRelaxed && !isStrict
        ? parsed.hard_constraints.max_price != null &&
            (p.price_inr ?? p.mrp_inr ?? 0) > parsed.hard_constraints.max_price
          ? `Over ₹${parsed.hard_constraints.max_price} — close option`
          : "Close match"
        : null,
  }));

  const summary = useRelaxed
    ? `Few exact matches for "${parsed.product_terms.join(" ") || "your request"}" — showing close options.`
    : parsed.explanation;

  return { rankings, summary, relaxed: useRelaxed };
}

/** Merge LLM order with deterministic rows — only SKUs from the gated list. */
export function mergeDeterministicWithLlmRankings(
  deterministic: LlmRankedItem[],
  llm: LlmRankedItem[],
  gatedIds: Set<string>,
  limit: number,
): LlmRankedItem[] {
  const detById = new Map(deterministic.map((r) => [r.product_id, r]));
  const seen = new Set<string>();
  const out: LlmRankedItem[] = [];

  for (const lr of llm) {
    if (!gatedIds.has(lr.product_id)) continue;
    const base = detById.get(lr.product_id);
    if (!base) continue;
    seen.add(lr.product_id);
    out.push({
      ...base,
      reasons: lr.reasons.length ? lr.reasons : base.reasons,
      warning: lr.warning ?? base.warning,
    });
    if (out.length >= limit) break;
  }

  for (const dr of deterministic) {
    if (seen.has(dr.product_id)) continue;
    out.push(dr);
    if (out.length >= limit) break;
  }

  return out;
}

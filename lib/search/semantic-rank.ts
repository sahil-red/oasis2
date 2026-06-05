import { matchAdditives } from "@/lib/scoring/rules";
import { insCodesFromText } from "@/lib/scoring/intelligence-row-resolve";
import type { ProductListItem } from "@/lib/products/queries";
import type { ProductNutrition } from "@/lib/supabase/types";
import { computeGoalFit, goalFitInputs } from "@/lib/goals/fit";
import type { GoalId } from "@/lib/goals/types";
import type { ParsedHealthContext, ParsedProductQuery } from "@/lib/search/query-parse";
import { passesHardConstraints } from "@/lib/search/ai-retrieval";
import { passesNoAddedSugarRule } from "@/lib/search/added-sugar-scan";
import {
  l3IntentForProductTerm,
  l3IntentRelevanceBoost,
  passesL3IntentGate,
} from "@/lib/search/l3-category-intent";
import { productUsecase } from "@/lib/products/catalog-meta";
import {
  isMilkAdjacentProduct,
  milkIntentSortTier,
  milkRelevanceAdjust,
} from "@/lib/search/milk-intent";
import {
  isPlantPaneerSubstitute,
  paneerIntentSortTier,
  paneerRelevanceAdjust,
} from "@/lib/search/paneer-intent";
import { blockedForAdultHealthGoal } from "@/lib/search/audience-gate";
import { isFalsePositiveProductLabel } from "@/lib/search/product-term-heuristics";
import type { LlmRankedItem } from "@/lib/search/ai-rank";
import { buildMatchReasons } from "@/lib/search/match-reasons";

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

const PRIMARY_TERM_SYNONYMS: Record<string, string[]> = {
  buttermilk: ["chaas", "chaach", "chach", "mattha", "matthaa"],
  chaas: ["buttermilk", "chaach", "chach", "mattha"],
};

function termMatchesInHaystack(hay: string, term: string): boolean {
  const tl = term.toLowerCase();
  if (matchesKeyword(hay, tl)) return true;
  for (const syn of PRIMARY_TERM_SYNONYMS[tl] ?? []) {
    if (matchesKeyword(hay, syn)) return true;
  }
  const rule = l3IntentForProductTerm(term);
  if (rule?.allow.some((re) => re.test(hay))) return true;
  return false;
}

/** Every gated result must match a primary product term (name, subcategory, or L3). */
export function matchesPrimaryProductType(
  p: ProductListItem,
  parsed: ParsedProductQuery,
): boolean {
  if (!parsed.product_terms.length) return true;
  const hay = productTypeHaystack(p);
  return parsed.product_terms.some((t) => termMatchesInHaystack(hay, t));
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

  if (!passesL3IntentGate(p, parsed)) return false;
  return matchesPrimaryProductType(p, parsed);
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

  if (blockedForAdultHealthGoal(p, parsed)) return 0;

  if (
    parsed.product_terms.some((t) => t.toLowerCase() === "paneer") &&
    isPlantPaneerSubstitute(p) &&
    !parsed.hard_constraints.vegan
  ) {
    const name = (p.name ?? "").toLowerCase();
    if (!/\bpaneer\b/i.test(name)) return 0;
  }

  if (
    parsed.product_terms.some((t) => t.toLowerCase() === "milk") &&
    isMilkAdjacentProduct(p)
  ) {
    return 0;
  }

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
  score += paneerRelevanceAdjust(p, parsed.product_terms, {
    preferPlant: parsed.hard_constraints.vegan === true,
    lowFatPreferred: parsed.soft_preferences.some((s) => /low fat/i.test(s)),
  });
  score += milkRelevanceAdjust(p, parsed.product_terms, parsed.sort_intent);
  score += healthContextSortBoost(p, parsed);
  score += healthiestRelevanceAdjust(p, parsed);
  score += Math.min(12, (p.core_scores?.score ?? 0) * 0.02);
  return score;
}

/** When user asked for "healthy X", demote instant junk and boost cleaner labels. */
function healthiestRelevanceAdjust(p: ProductListItem, parsed: ParsedProductQuery): number {
  if (parsed.sort_intent !== "healthiest") return 0;
  const verdict = p.core_scores?.verdict ?? "";
  let adj = 0;
  if (verdict === "skip") adj -= 45;
  else if (verdict === "occasional_treat") adj -= 15;
  else if (verdict === "good_choice" || verdict === "daily_staple") adj += 12;

  const label = [p.name, p.subcategory, productUsecase(p)].filter(Boolean).join(" ").toLowerCase();
  if (/\b(instant|ramen|cup noodle|2[\s-]?minute|maggi masala|yeul|samyang|jin ramen|spicy flavor)\b/i.test(label)) {
    adj -= 30;
  }
  if (/\b(whole wheat|whole grain|atta|millet|ragi|no maida|brown rice)\b/i.test(label)) {
    adj += 18;
  }
  return adj;
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

function productSugarG(p: ProductListItem): number | null {
  return (
    nutritionValue(p.nutrition, "sugar_g_100g") ??
    nutritionValue(p.nutrition, "added_sugar_g_100g")
  );
}

function kidsAdditivePenalty(ingredients: string | null | undefined): number {
  if (!ingredients?.trim()) return 0;
  const text = ingredients.toLowerCase();
  let n = 0;
  if (/\bpreserv/i.test(text)) n += 2;
  const codes = insCodesFromText(text);
  if (
    codes.some((c) => {
      const num = Number(c.replace(/\D/g, ""));
      return num >= 200 && num <= 299;
    })
  ) {
    n += 2;
  }
  n += matchAdditives(ingredients).filter(
    (h) => h.tier === "moderate" || h.tier === "hazardous",
  ).length;
  return n;
}

export function usesHealthIntentSort(parsed: ParsedProductQuery): boolean {
  return healthContextGoalId(parsed.health_contexts) != null;
}

/** Map AI search health context to the Scout goal used on PDP / catalog goal boards. */
export function healthContextGoalId(contexts: ParsedHealthContext[]): GoalId | null {
  if (contexts.includes("diabetic")) return "diabetic";
  if (contexts.includes("pcos")) return "pcos";
  if (contexts.includes("kids")) return "kids";
  if (contexts.includes("fat_loss")) return "fat-loss";
  if (contexts.includes("gym")) return "gym";
  if (contexts.includes("bulk")) return "bulk";
  return null;
}

function hasGoalFitSignals(p: ProductListItem): boolean {
  const n = p.nutrition;
  if (
    n &&
    [
      n.sugar_g_100g,
      n.added_sugar_g_100g,
      n.protein_g_100g,
      n.fat_g_100g,
      n.fiber_g_100g,
      n.sodium_mg_100g,
    ].some((v) => typeof v === "number" && Number.isFinite(v))
  ) {
    return true;
  }
  if (p.ingredients_raw?.trim()) return true;
  return typeof p.core_scores?.score === "number";
}

/** Per-goal Scout fit (0–100) when we have label data to score it. */
export function healthContextGoalFit(
  p: ProductListItem,
  parsed: ParsedProductQuery,
): number | null {
  const goal = healthContextGoalId(parsed.health_contexts);
  if (!goal || !hasGoalFitSignals(p)) return null;
  return computeGoalFit(goal, goalFitInputs(p)).fit;
}

function heuristicHealthIntentTier(
  p: ProductListItem,
  parsed: ParsedProductQuery,
): number {
  const ctx = parsed.health_contexts;
  const sugar = productSugarG(p);
  const subs = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];
  const ing = (p.ingredients_raw ?? "").toLowerCase();

  if (ctx.includes("diabetic") || ctx.includes("pcos")) {
    if (subs.includes("hidden_sweetener")) return 0;
    if (sugar == null) return 18;
    if (sugar <= 1) return 100;
    if (sugar <= 3) return 88;
    if (sugar <= 5) return 72;
    if (sugar <= 8) return 48;
    if (sugar <= 10) return 28;
    if (sugar <= 15) return 8;
    return 0;
  }

  if (ctx.includes("fat_loss")) {
    if (sugar == null) return 25;
    if (sugar <= 3) return 90;
    if (sugar <= 8) return 65;
    if (sugar <= 12) return 35;
    return Math.max(0, 20 - Math.round(sugar));
  }

  if (ctx.includes("kids")) {
    let tier = Math.round((p.core_scores?.score ?? 45) * 0.55);
    if (subs.includes("hidden_sweetener")) tier -= 28;
    if (sugar != null) {
      if (sugar <= 3) tier += 38;
      else if (sugar <= 8) tier += 18;
      else if (sugar <= 12) tier += 2;
      else if (sugar <= 18) tier -= 18;
      else tier -= 32;
    } else {
      tier -= 8;
    }
    if (/maida|refined wheat flour/i.test(ing)) tier -= 32;
    tier -= Math.min(28, kidsAdditivePenalty(p.ingredients_raw) * 9);
    const verdict = p.core_scores?.verdict;
    if (verdict === "occasional_treat" || verdict === "skip") tier -= 12;
    return Math.max(0, Math.min(100, tier));
  }

  return 0;
}

/** 0–100 — higher means better fit for diabetic / kids / fat-loss intent. */
export function healthIntentSortTier(
  p: ProductListItem,
  parsed: ParsedProductQuery,
): number {
  const goalFit = healthContextGoalFit(p, parsed);
  if (goalFit != null) return goalFit;
  return heuristicHealthIntentTier(p, parsed);
}

function healthContextSortBoost(p: ProductListItem, parsed: ParsedProductQuery): number {
  if (!usesHealthIntentSort(parsed)) return 0;
  const tier = healthIntentSortTier(p, parsed);
  // Goal-only queries (e.g. "food for bulking") have no product type — weight goal fit more.
  const weight = parsed.product_terms.length ? 0.2 : 0.42;
  return Math.round(tier * weight);
}

function healthIntentSugarSortKey(
  p: ProductListItem,
  parsed: ParsedProductQuery,
): number {
  const sugar = productSugarG(p);
  if (sugar != null) return -sugar;
  return usesHealthIntentSort(parsed) ? -999 : -1;
}

function healthIntentSortKey(
  p: ProductListItem,
  parsed: ParsedProductQuery,
  relevance: number,
  strictMatch: boolean,
  extras: number[],
): number[] {
  const healthTier = healthIntentSortTier(p, parsed);
  return [
    strictMatch ? 1 : 0,
    healthTier,
    healthIntentSugarSortKey(p, parsed),
    relevance,
    ...extras,
  ];
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
  const paneerTier = paneerIntentSortTier(p, parsed.product_terms);
  const lowFatPref = parsed.soft_preferences.some((s) => /low fat/i.test(s));
  const healthIntent = usesHealthIntentSort(parsed);

  switch (parsed.sort_intent) {
    case "highest_protein": {
      const milkTier = milkIntentSortTier(p, parsed.product_terms);
      const typeTier = matchesPrimaryProductType(p, parsed) ? 1 : 0;
      return [
        typeTier,
        milkTier || paneerIntentSortTier(p, parsed.product_terms),
        strictTier,
        protein ?? -1,
        relevance,
        healthBoost,
        scout,
      ];
    }
    case "cheapest":
      return [strictTier, relevance, price === 999999 ? -1 : -price, healthBoost, scout];
    case "healthiest":
      if (healthIntent) {
        const goalScout = healthContextGoalFit(p, parsed) ?? scout;
        return healthIntentSortKey(p, parsed, relevance, strictMatch, [
          goalScout,
          healthBoost,
          protein ?? 0,
        ]);
      }
      // "healthy noodles" etc. — Scout score first, not keyword relevance alone.
      return [strictTier, scout, relevance, healthBoost, protein ?? 0];
    case "best_match":
    default:
      if (healthIntent) {
        const goalScout = healthContextGoalFit(p, parsed) ?? scout;
        return healthIntentSortKey(p, parsed, relevance, strictMatch, [
          preservTier,
          goalScout,
          protein ?? 0,
        ]);
      }
      if (paneerTier > 0) {
        const fatKey = lowFatPref || parsed.hard_constraints.max_fat_g_100g != null;
        return [
          paneerTier,
          strictTier,
          relevance,
          preservTier,
          fatKey && fat != null ? -fat : 0,
          healthBoost,
          scout,
        ];
      }
      if (parsed.hard_constraints.max_fat_g_100g != null) {
        return [strictTier, relevance, preservTier, fat != null ? -fat : -1, healthBoost, scout];
      }
      if (parsed.hard_constraints.max_sugar_g_100g != null && !healthIntent) {
        return [strictTier, relevance, preservTier, sugar != null ? -sugar : -1, healthBoost, scout];
      }
      if (lowFatPref) {
        return [strictTier, relevance, preservTier, fat != null ? -fat : -1, healthBoost, scout];
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
  return buildMatchReasons(p, parsed);
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

  const healthWeighted = usesHealthIntentSort(parsed);
  const healthiestRank = parsed.sort_intent === "healthiest";
  const rankings: LlmRankedItem[] = ordered.map(({ p, relevance, strict: isStrict }) => {
    const goalFit = healthContextGoalFit(p, parsed);
    const scoutScore = p.core_scores?.score ?? 0;
    const score = healthWeighted
      ? goalFit != null
        ? Math.min(100, Math.round(relevance * 0.22 + goalFit * 0.78))
        : Math.min(100, Math.round(relevance * 0.4 + healthIntentSortTier(p, parsed) * 0.6))
      : healthiestRank
        ? Math.min(100, Math.round(scoutScore * 0.78 + relevance * 0.22))
        : Math.min(100, Math.round(relevance + scoutScore * 0.15));
    return {
    product_id: p.id,
    score,
    reasons: deterministicReasons(p, parsed),
    warning:
      useRelaxed && !isStrict
        ? parsed.hard_constraints.max_price != null &&
            (p.price_inr ?? p.mrp_inr ?? 0) > parsed.hard_constraints.max_price
          ? `Over ₹${parsed.hard_constraints.max_price} — close option`
          : "Close match"
        : null,
  };
  });

  const summary = useRelaxed
    ? `Few exact matches for "${parsed.product_terms.join(" ") || "your request"}" — showing close options.`
    : parsed.explanation;

  return { rankings, summary, relaxed: useRelaxed };
}

/** Blend match, health, and LLM intent for sort order (display scores stay on `det`). */
export function blendedSearchRankScore(
  matchScore: number,
  healthScore: number,
  intentScore: number,
): number {
  const match = Math.max(0, Math.min(100, matchScore));
  const health = Math.max(0, Math.min(100, healthScore));
  const intent = Math.max(0, Math.min(100, intentScore));
  return match * 0.45 + health * 0.35 + intent * 0.2;
}

/** Re-rank gated SKUs by blended scores — LLM reasons only; order is not LLM-first. */
export function mergeDeterministicWithLlmRankings(
  deterministic: LlmRankedItem[],
  llm: LlmRankedItem[],
  gatedIds: Set<string>,
  limit: number,
  ctx: {
    byId: Map<string, ProductListItem>;
    parsed: ParsedProductQuery;
  },
): LlmRankedItem[] {
  const llmById = new Map(llm.map((r) => [r.product_id, r]));
  const pool = deterministic.filter((d) => gatedIds.has(d.product_id));

  const scored = pool.map((det) => {
    const p = ctx.byId.get(det.product_id);
    const llmRow = llmById.get(det.product_id);
    const health =
      (p ? healthContextGoalFit(p, ctx.parsed) : null) ?? p?.core_scores?.score ?? 0;
    const intent = llmRow?.score ?? det.score * 0.85;
    return {
      det,
      llmRow,
      blend: blendedSearchRankScore(det.score, health, intent),
    };
  });

  scored.sort((a, b) => b.blend - a.blend);

  return scored.slice(0, limit).map(({ det, llmRow }) => ({
    ...det,
    reasons: llmRow?.reasons.length ? llmRow.reasons : det.reasons,
    warning: llmRow?.warning ?? det.warning,
  }));
}

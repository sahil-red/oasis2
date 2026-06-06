/**
 * Search V2 intent understanding — SEARCH_V2_PLAN.md §6, §9, §12, §14, §16.2
 *
 * Heuristic-first (reuses query-parse negation/synonyms). LLM only when confidence is low (§9).
 */
import { detectGoalId } from "@/lib/search/v2/goal-graph";
import { extractFlavoursFromName, inferPrimaryType } from "@/lib/search/v2/traits";
import type { SearchIntentKind, SearchIntentV2 } from "@/lib/search/v2/types";
import type { AiSearchPreferences } from "@/lib/search/ai-usage";
import { mergeSavedPreferences } from "@/lib/search/merge-preferences";
import {
  heuristicParseProductQuery,
  type ParsedHealthContext,
  type ParsedProductQuery,
  type ParsedSortIntent,
} from "@/lib/search/query-parse";
import { canonicalTypeFromToken, expandTypeSynonyms } from "@/lib/search/synonyms";

const INTENT_CONFIDENCE_LLM_THRESHOLD = 0.55;

/** §14 word-order: chocolate milk → milk; milk chocolate → chocolate */
const HEAD_NOUN_PAIRS: Array<{ pattern: RegExp; head_type: string }> = [
  { pattern: /\bchocolate\s+milk\b/i, head_type: "milk" },
  { pattern: /\bmilk\s+chocolate\b/i, head_type: "chocolate" },
];

const BRAND_SINGLE_TOKEN = new Set([
  "amul",
  "nestle",
  "britannia",
  "parle",
  "haldiram",
  "dabur",
  "patanjali",
  "mother dairy",
  "cadbury",
  "pepsi",
  "coca",
  "maggi",
  "mtr",
  "kellogg",
  "itc",
]);

const HEALTH_CONTEXT_GOAL: Partial<Record<ParsedHealthContext, string>> = {
  diabetic: "diabetes",
  pcos: "pcos",
  kids: "kids_tiffin",
  gym: "gym",
  fat_loss: "weight_loss",
  bulk: "muscle_gain",
};

function mapSort(sort: ParsedSortIntent): SearchIntentV2["sort"] {
  if (sort === "highest_protein") return "highest_protein";
  if (sort === "cheapest") return "cheapest";
  if (sort === "healthiest") return "healthiest";
  return "best_match";
}

function headNounType(query: string): string | null {
  for (const { pattern, head_type } of HEAD_NOUN_PAIRS) {
    if (pattern.test(query)) return head_type;
  }
  return null;
}

function primaryTypeFromParsed(parsed: ParsedProductQuery, rawQuery: string): string | null {
  const head = headNounType(rawQuery);
  if (head) return head;

  // §16.2 atomic compounds — multi-word types from the query before single tokens
  const compound = inferPrimaryType({ name: rawQuery });
  if (compound.primary_type !== "food") return compound.primary_type;

  for (const term of parsed.product_terms) {
    const fromTerm = inferPrimaryType({ name: term });
    if (fromTerm.primary_type !== "food") return fromTerm.primary_type;
    const canon = canonicalTypeFromToken(term) ?? term.toLowerCase();
    if (canon.length >= 2) return canon;
  }
  return null;
}

function goalIdFromParsed(parsed: ParsedProductQuery, rawQuery: string): string | null {
  const fromGraph = detectGoalId(rawQuery);
  if (fromGraph) return fromGraph;
  for (const ctx of parsed.health_contexts) {
    const g = HEALTH_CONTEXT_GOAL[ctx];
    if (g) return g;
  }
  return null;
}

/**
 * §14 routing: goal/vague vs directed vs brand vs ambiguous.
 * Never relax primary_type or required_flavour (handled in relaxation module).
 */
function resolveKind(
  rawQuery: string,
  parsed: ParsedProductQuery,
  primaryType: string | null,
  goalId: string | null,
): SearchIntentKind {
  const q = rawQuery.toLowerCase().trim();
  const tokens = q.split(/[^a-z0-9&]+/).filter((t) => t.length >= 2);
  if (tokens.length === 1 && BRAND_SINGLE_TOKEN.has(tokens[0]!)) return "brand";

  // §14 goal/vague: healthy drinks for running, tiffin stuff that isn't junk
  if (
    goalId &&
    /\b(healthy|healthiest|for\s+(running|gym|kids|weight|loss)|not junk|tiffin)\b/i.test(q)
  ) {
    return "goal";
  }
  if (/\b(drinks?|snacks?|foods?)\s+for\s+(running|gym|kids|weight|loss)\b/i.test(q)) {
    return "goal";
  }
  if (/\btiffin\b.*\b(not junk|isn't junk|wholesome)\b/i.test(q)) return "goal";

  // §14 type + health ctx: biscuits for diabetics → directed
  if (primaryType && goalId === "diabetes" && /\bfor\s+diabet/i.test(q)) return "directed";

  if (!primaryType && goalId) return "goal";
  if (!primaryType && !goalId && tokens.length <= 2 && /\bprotein\b/i.test(q)) return "ambiguous";

  return "directed";
}

function buildModifiers(parsed: ParsedProductQuery, primaryType: string | null, rawQuery: string): string[] {
  const mods: string[] = [];
  const q = rawQuery.toLowerCase();
  if (/\bno added sugar\b/i.test(q) || parsed.hard_constraints.max_sugar_g_100g === 1) {
    mods.push("no_added_sugar");
  }
  // §14 relative nutrition: high protein milk → protein_tier, not min_protein_g
  if (parsed.sort_intent === "highest_protein" && primaryType) {
    mods.push("high_protein_tier");
  }
  if (parsed.hard_constraints.max_sugar_g_100g != null && primaryType) {
    mods.push("low_sugar");
  }
  return mods;
}

function mapConstraints(parsed: ParsedProductQuery, primaryType: string | null): SearchIntentV2["constraints"] {
  const c = parsed.hard_constraints;
  const constraints: SearchIntentV2["constraints"] = {
    avoid_ingredients: [...(c.avoid_ingredients ?? [])],
    allergens_excluded: [...(c.allergens_excluded ?? [])],
  };

  if (c.max_price != null) constraints.max_price = c.max_price;
  if (c.max_sugar_g_100g != null) constraints.max_sugar_g = c.max_sugar_g_100g;
  if (c.max_fat_g_100g != null) constraints.max_fat_g = c.max_fat_g_100g;
  // §14: min_protein_g only when no specific food type is named
  if (c.min_protein_g_100g != null && !primaryType) {
    constraints.min_protein_g = c.min_protein_g_100g;
  }
  if (c.vegan) constraints.vegan = true;
  if (c.vegetarian) constraints.vegetarian = true;
  if (c.avoid_ingredients?.some((a) => /palm/i.test(a))) constraints.palm_oil_free = true;

  return constraints;
}

function computeConfidence(
  kind: SearchIntentKind,
  primaryType: string | null,
  flavours: string[],
  goalId: string | null,
): number {
  let confidence = 0.7;
  if (primaryType) confidence += 0.12;
  if (flavours.length) confidence += 0.06;
  if (goalId) confidence += 0.06;
  if (kind === "brand") confidence += 0.1;
  if (kind === "ambiguous") confidence = 0.35;
  return Math.min(1, confidence);
}

/** §9: LLM hook reserved — returns false until Groq intent parse is wired. */
export function shouldUseLlmIntentParse(confidence: number): boolean {
  return confidence < INTENT_CONFIDENCE_LLM_THRESHOLD;
}

/**
 * Parse query → SearchIntentV2 (deterministic hot path).
 * Uses heuristicParseProductQuery for negation (§12 bina cheeni) and constraints.
 */
export function parseSearchIntent(
  rawQuery: string,
  preferences?: AiSearchPreferences | null,
): SearchIntentV2 {
  const raw_query = rawQuery.trim();
  let parsed = heuristicParseProductQuery(raw_query);
  if (preferences) {
    parsed = mergeSavedPreferences(parsed, preferences);
  }

  const primary_type = primaryTypeFromParsed(parsed, raw_query);
  const required_flavours = extractFlavoursFromName(raw_query);
  const goal_id = goalIdFromParsed(parsed, raw_query);
  const kind = resolveKind(raw_query, parsed, primary_type, goal_id);
  const modifiers = buildModifiers(parsed, primary_type, raw_query);
  const constraints = mapConstraints(parsed, primary_type);
  const sort = mapSort(parsed.sort_intent);
  const confidence = computeConfidence(kind, primary_type, required_flavours, goal_id);

  return {
    kind,
    goal_id: kind === "goal" ? goal_id : null,
    primary_type,
    required_flavours,
    modifiers,
    constraints,
    sort,
    confidence,
    raw_query,
  };
}

/** @deprecated alias */
export const parseSearchIntentV2 = parseSearchIntent;

/** §6 membership: type ∈ {type,synonyms} */
export function typeMatchTokens(intent: SearchIntentV2): string[] {
  if (intent.kind === "brand") {
    return intent.raw_query.toLowerCase().split(/\s+/).filter(Boolean);
  }
  return expandTypeSynonyms(intent.primary_type);
}

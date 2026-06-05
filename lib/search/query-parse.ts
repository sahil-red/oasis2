import { deepseekChat, extractJsonObject, type DeepseekUsage } from "@/lib/search/deepseek-client";
import { resolveDeepseekApiKey } from "@/lib/search/deepseek-keys";
import { applyGoalIntentHeuristics } from "@/lib/search/goal-intent-registry";
import { stripGoalMetaProductTerms } from "@/lib/search/goal-query-normalize";
import { applyL3IntentToParsed } from "@/lib/search/l3-category-intent";
import { applyProductTermHeuristics } from "@/lib/search/product-term-heuristics";

export type ParsedHealthContext =
  | "diabetic"
  | "pcos"
  | "kids"
  | "gym"
  | "fat_loss"
  | "bulk"
  | "parents";

export type ParsedSortIntent =
  | "best_match"
  | "healthiest"
  | "cheapest"
  | "highest_protein";

export type ParsedProductQuery = {
  product_terms: string[];
  /** Synonyms and related product names for catalog retrieval (e.g. coke zero, diet coke, sprite zero). */
  search_keywords: string[];
  /** Product types to deprioritize or exclude (e.g. water, laddu, biscuit when user wants ghee). */
  exclude_keywords: string[];
  categories: string[];
  /** Regex source strings for allowed Zepto L3 / use-case labels. */
  l3_allow_patterns?: string[];
  /** Regex source strings for blocked L3 labels. */
  l3_block_patterns?: string[];
  hard_constraints: {
    max_price?: number;
    max_sugar_g_100g?: number;
    max_fat_g_100g?: number;
    min_protein_g_100g?: number;
    vegetarian?: boolean;
    vegan?: boolean;
    avoid_ingredients?: string[];
    allergens_excluded?: string[];
    avoid_sublabels?: string[];
  };
  soft_preferences: string[];
  health_contexts: ParsedHealthContext[];
  sort_intent: ParsedSortIntent;
  explanation: string;
};

export type QueryParseResult = {
  parsed: ParsedProductQuery;
  source: "deepseek" | "heuristic";
  usage?: DeepseekUsage | null;
  warning?: string;
};

type DeepseekOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
};

const VALID_CONTEXTS = new Set<ParsedHealthContext>([
  "diabetic",
  "pcos",
  "kids",
  "gym",
  "fat_loss",
  "bulk",
  "parents",
]);

const VALID_SORTS = new Set<ParsedSortIntent>([
  "best_match",
  "healthiest",
  "cheapest",
  "highest_protein",
]);

const QUERY_PARSER_SYSTEM_PROMPT = `
You parse Indian grocery shopping requests into strict compact JSON.
Return exactly one JSON object and no markdown.

Schema:
{
  "product_terms": string[],
  "search_keywords": string[],
  "exclude_keywords": string[],
  "categories": string[],
  "hard_constraints": {
    "max_price"?: number,
    "max_sugar_g_100g"?: number,
    "max_fat_g_100g"?: number,
    "min_protein_g_100g"?: number,
    "vegetarian"?: boolean,
    "avoid_ingredients"?: string[],
    "allergens_excluded"?: string[],
    "avoid_sublabels"?: string[]
  },
  "soft_preferences": string[],
  "health_contexts": ("diabetic"|"pcos"|"kids"|"gym"|"fat_loss"|"bulk"|"parents")[],
  "sort_intent": "best_match"|"healthiest"|"cheapest"|"highest_protein",
  "explanation": string
}

Rules:
- product_terms are the primary product type the user wants (1-3 words): ghee, soft drink, paneer, biscuits.
- search_keywords are 8-20 retrieval terms to find matching SKUs in an Indian grocery catalog — include brand names, variants, and synonyms. Example for "zero sugar soft drinks": ["coke zero", "diet coke", "pepsi zero", "sprite zero", "7up zero", "soft drink", "soda", "cola", "carbonated", "zero sugar drink"]. Example for "grass fed ghee": ["ghee", "cow ghee", "a2 ghee", "bilona", "desi ghee", "grass fed"].
- exclude_keywords are product types that would be wrong matches (2-8 words). Example for ghee: ["laddu", "ladoo", "barfi", "mithai", "biscuit", "snack"]. Example for paneer: ["masala", "marinade", "spice", "seasoning", "soda", "goli", "bread", "pav", "bhaji", "mix"]. Example for soft drinks: ["water", "mineral water", "drinking water", "aquafina", "bisleri"].
- categories are broad aisle/shelf hints only when obvious: snacks, dairy, breakfast, bakery, sweets, beverages.
- Use hard constraints only when the user asks for a limit or strict requirement.
- "low sugar" means max_sugar_g_100g = 10 unless a numeric limit is given.
- "no sugar" or "zero sugar" means max_sugar_g_100g = 1.
- "low fat" means max_fat_g_100g = 12 unless a numeric limit is given, except for paneer/milk/ghee/curd/yogurt/cheese — use soft preference "low fat" and sort by fat instead.
- CRITICAL: "high protein [specific food]" (e.g. "high protein milk", "high protein curd", "high protein bread") means the user wants that food sorted by protein content. Set sort_intent:"highest_protein" ONLY. Do NOT set min_protein_g_100g — milk/curd/bread naturally have low protein, the user wants the best option within that food type.
- Set min_protein_g_100g = 12 ONLY when the user is explicitly looking for protein supplements or high-protein products without naming a specific everyday food (e.g. "protein powder", "high protein snacks", "protein bar"). Never set it when a specific food is named.
- "low sugar" for a specific food (e.g. "low sugar biscuits") means max_sugar_g_100g = 10 — apply as a hard constraint since biscuits can vary widely.
- Map gym/high protein snacks to health_contexts:["gym"]; fat loss/weight loss to ["fat_loss"]; diabetic/diabetes to ["diabetic"]; PCOS to ["pcos"]; kids/children to ["kids"]; bulking/weight gain to ["bulk"]; parents/elderly/for mom/for dad to ["parents"].
- Do NOT use meta words as product_terms: food, bulking, bulk, gain, weight, fitness, snacks (when only describing a goal). Example: "food for bulking" → product_terms:[], health_contexts:["bulk"], exclude_keywords should include baby cereal brands.
- Keep explanation under 22 words.
`;

const NON_PRODUCT_TERMS = new Set([
  "fat",
  "sugar",
  "sugars",
  "protein",
  "carb",
  "carbs",
  "calorie",
  "calories",
  "kcal",
  "sodium",
  "salt",
  "healthy",
  "healthiest",
  "budget",
  "food",
  "foods",
  "bulking",
  "bulk",
  "gain",
  "weight",
  "fitness",
  "diet",
  "snack",
  "snacks",
  "meal",
  "meals",
  "for",
  "the",
  "and",
  "parents",
  "parent",
  "elderly",
  "senior",
  "seniors",
  "mom",
  "dad",
  "mother",
  "father",
]);

function emptyParsed(prompt: string): ParsedProductQuery {
  const terms = prompt
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 3 && !NON_PRODUCT_TERMS.has(w))
    .slice(0, 4);
  return {
    product_terms: terms,
    search_keywords: terms,
    exclude_keywords: [],
    categories: [],
    l3_allow_patterns: [],
    l3_block_patterns: [],
    hard_constraints: {},
    soft_preferences: [],
    health_contexts: [],
    sort_intent: "best_match",
    explanation: "Showing the closest matches for your request.",
  };
}

function firstNumberNear(prompt: string, pattern: RegExp): number | undefined {
  const match = prompt.match(pattern);
  if (!match?.[1]) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function heuristicParseProductQuery(prompt: string): ParsedProductQuery {
  const lower = prompt.toLowerCase();
  const parsed = emptyParsed(prompt);
  const terms = lower
    .replace(/\b(low|less|under|below|with|without|high|best|healthy|healthiest|cheap|cheapest|rupees|rs|inr|for|and|or|no)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !NON_PRODUCT_TERMS.has(w));
  parsed.product_terms = [...new Set(terms)].slice(0, 5);

  const maxPrice =
    firstNumberNear(lower, /(?:under|below|less than|<|rs|₹|inr)\s*(\d{2,5})/) ??
    firstNumberNear(lower, /(\d{2,5})\s*(?:rs|rupees|inr|₹)/);
  if (maxPrice) parsed.hard_constraints.max_price = maxPrice;

  const sugarLimit = firstNumberNear(lower, /(?:sugar|sugars)\D{0,12}(\d{1,3})\s*g/);
  if (/zero sugar|no sugar/.test(lower)) parsed.hard_constraints.max_sugar_g_100g = 1;
  else if (sugarLimit) parsed.hard_constraints.max_sugar_g_100g = sugarLimit;
  else if (/low sugar|less sugar/.test(lower)) {
    parsed.hard_constraints.max_sugar_g_100g = 10;
  } else if (/diabetic|diabetes|pcos/.test(lower)) {
    parsed.hard_constraints.max_sugar_g_100g = 5;
  }

  const fatLimit = firstNumberNear(lower, /(?:fat)\D{0,12}(\d{1,3})\s*g/);
  if (fatLimit) parsed.hard_constraints.max_fat_g_100g = fatLimit;

  const proteinMin = firstNumberNear(lower, /(?:protein)\D{0,12}(\d{1,3})\s*g/);
  const namedFood =
    parsed.product_terms.length > 0 &&
    !/protein powder|protein bar|whey|supplement/.test(lower);
  if (proteinMin) parsed.hard_constraints.min_protein_g_100g = proteinMin;
  else if (/high protein|protein rich|\bprotein\s+for\b|\bfor\s+.*\bprotein\b/i.test(lower)) {
    if (namedFood) parsed.sort_intent = "highest_protein";
    else parsed.hard_constraints.min_protein_g_100g = 12;
  }

  if (/\bvegan\b/.test(lower)) {
    parsed.hard_constraints.vegan = true;
    parsed.hard_constraints.vegetarian = true;
  } else if (/veg|vegetarian/.test(lower)) {
    parsed.hard_constraints.vegetarian = true;
  }
  if (/palm oil/.test(lower)) parsed.hard_constraints.avoid_ingredients = ["palm oil"];
  if (/gluten/.test(lower)) parsed.hard_constraints.allergens_excluded = ["gluten"];
  if (/hidden sweetener|no hidden sweetener|without hidden sweetener|artificial sweetener/.test(lower)) {
    parsed.hard_constraints.avoid_sublabels = ["hidden_sweetener"];
    parsed.sort_intent = "healthiest";
  }

  applyGoalIntentHeuristics(parsed, lower);

  if (/\b(cheap|cheapest|budget)\b/.test(lower)) parsed.sort_intent = "cheapest";
  if (/high protein|protein rich/.test(lower) && parsed.sort_intent !== "highest_protein") {
    parsed.sort_intent = "highest_protein";
  }

  if (/no added sugar|without added sugar/.test(lower)) {
    parsed.hard_constraints.max_sugar_g_100g = 1;
    parsed.soft_preferences.push("no added sugar");
  }
  if (/no preserv|without preserv|preservative.?free/.test(lower)) {
    parsed.soft_preferences.push("no preservatives");
    parsed.hard_constraints.avoid_sublabels = [
      ...(parsed.hard_constraints.avoid_sublabels ?? []),
      "contains_preservatives",
    ];
  }
  if (/no maida|without maida/.test(lower)) {
    parsed.hard_constraints.avoid_ingredients = [
      ...(parsed.hard_constraints.avoid_ingredients ?? []),
      "maida",
      "refined wheat flour",
    ];
  }
  if (/no palm oil|without palm oil/.test(lower)) {
    parsed.hard_constraints.avoid_ingredients = [
      ...(parsed.hard_constraints.avoid_ingredients ?? []),
      "palm oil",
      "palmolein",
    ];
  }
  if (/healthy|healthiest|best/.test(lower)) {
    parsed.sort_intent = "healthiest";
    if (/healthy|healthiest/.test(lower) && !parsed.soft_preferences.some((s) => /healthy/i.test(s))) {
      parsed.soft_preferences.push("healthy");
    }
  }

  parsed.search_keywords = [...new Set(parsed.product_terms)];
  if (/zero sugar|no sugar/.test(lower) && /soft|soda|drink|cola|beverage/.test(lower)) {
    parsed.search_keywords.push(
      "coke zero",
      "diet coke",
      "pepsi zero",
      "sprite zero",
      "7up zero",
      "soft drink",
      "soda",
      "cola",
      "zero sugar",
    );
    parsed.exclude_keywords = ["water", "mineral water", "drinking water", "aquafina", "bisleri"];
  }
  stripGoalMetaProductTerms(parsed);
  applyProductTermHeuristics(parsed, lower);
  applyL3IntentToParsed(parsed);

  const namedFreshDairy = parsed.product_terms.some((t) =>
    ["paneer", "milk", "ghee", "curd", "yogurt", "cheese"].includes(t.toLowerCase()),
  );
  if (/low fat|less fat/.test(lower) && !fatLimit) {
    if (namedFreshDairy) {
      parsed.soft_preferences.push("low fat");
    } else {
      parsed.hard_constraints.max_fat_g_100g = 12;
    }
  }

  parsed.explanation = "I parsed your request into product terms, limits, and health context.";
  return normalizeParsedProductQuery(parsed, prompt);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((v) => String(v).trim()).filter(Boolean).slice(0, 12)
    : [];
}

function asNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function normalizeParsedProductQuery(raw: unknown, prompt: string): ParsedProductQuery {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const constraints = record.hard_constraints && typeof record.hard_constraints === "object" && !Array.isArray(record.hard_constraints)
    ? record.hard_constraints as Record<string, unknown>
    : {};
  const fallback = emptyParsed(prompt);
  const contexts = asStringArray(record.health_contexts).filter((c): c is ParsedHealthContext =>
    VALID_CONTEXTS.has(c as ParsedHealthContext),
  );
  const sort = String(record.sort_intent ?? fallback.sort_intent);

  const productTerms = asStringArray(record.product_terms).length
    ? asStringArray(record.product_terms)
    : fallback.product_terms;
  const searchKeywords = asStringArray(record.search_keywords);
  const parsed: ParsedProductQuery = {
    product_terms: productTerms,
    search_keywords: searchKeywords.length ? searchKeywords : productTerms,
    exclude_keywords: asStringArray(record.exclude_keywords),
    categories: asStringArray(record.categories),
    l3_allow_patterns: asStringArray(record.l3_allow_patterns),
    l3_block_patterns: asStringArray(record.l3_block_patterns),
    hard_constraints: {
      max_price: asNumber(constraints.max_price),
      max_sugar_g_100g: asNumber(constraints.max_sugar_g_100g),
      max_fat_g_100g: asNumber(constraints.max_fat_g_100g),
      min_protein_g_100g: asNumber(constraints.min_protein_g_100g),
      vegetarian: typeof constraints.vegetarian === "boolean" ? constraints.vegetarian : undefined,
      vegan: typeof constraints.vegan === "boolean" ? constraints.vegan : undefined,
      avoid_ingredients: asStringArray(constraints.avoid_ingredients),
      allergens_excluded: asStringArray(constraints.allergens_excluded),
      avoid_sublabels: asStringArray(constraints.avoid_sublabels),
    },
    soft_preferences: asStringArray(record.soft_preferences),
    health_contexts: contexts,
    sort_intent: VALID_SORTS.has(sort as ParsedSortIntent) ? sort as ParsedSortIntent : "best_match",
    explanation:
      typeof record.explanation === "string" && record.explanation.trim()
        ? record.explanation.trim().slice(0, 180)
        : fallback.explanation,
  };
  stripGoalMetaProductTerms(parsed);
  applyL3IntentToParsed(parsed);
  return parsed;
}

export async function parseProductQueryWithDeepseek(
  prompt: string,
  opts: DeepseekOptions = {},
): Promise<QueryParseResult> {
  const apiKey = opts.apiKey ?? resolveDeepseekApiKey("search");
  if (!apiKey) {
    return {
      parsed: heuristicParseProductQuery(prompt),
      source: "heuristic",
      warning: "DEEPSEEK_API_KEY is missing; used local parser fallback.",
    };
  }

  try {
    const { content, usage } = await deepseekChat({
      apiKey,
      usageKind: "search",
      baseUrl: opts.baseUrl,
      model: opts.model,
      timeoutMs: opts.timeoutMs ?? 18_000,
      maxTokens: 900,
      jsonObject: true,
      system: QUERY_PARSER_SYSTEM_PROMPT,
      user: `User grocery request: ${prompt}`,
    });
    return {
      parsed: normalizeParsedProductQuery(extractJsonObject(content), prompt),
      source: "deepseek",
      usage,
    };
  } catch (error) {
    return {
      parsed: heuristicParseProductQuery(prompt),
      source: "heuristic",
      warning: `DeepSeek parser failed; used local parser fallback (${(error as Error).message}).`,
    };
  }
}

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
- CRITICAL — avoid_ingredients: when user says "no X", "without X", "X free", "bina X" (Hindi), or "X nahi" (Hindi/Hinglish), populate avoid_ingredients with the FULL synonym family, not just the literal word:
  - "no palm oil" / "bina palm oil" / "palm oil nahi" → avoid_ingredients: ["palm oil","palmolein","palm stearin","palm kernel","palm fat","palm"]
  - "no maida" / "bina maida" / "maida nahi" → avoid_ingredients: ["maida","refined wheat flour","all purpose flour","refined flour"]
  - "no preservatives" / "bina preservative" / "preservative nahi" → avoid_sublabels: ["contains_preservatives"]
  - "no artificial colours" / "artificial rang nahi" → avoid_sublabels: ["artificial_colors"]
  - "no artificial flavours" / "artificial flavour nahi" → avoid_sublabels: ["artificial_flavors"]
  - "no artificial additives" / "koi artificial nahi" → avoid_sublabels: ["artificial_colors","artificial_flavors"]
  - "no msg" / "ajinomoto nahi" → avoid_ingredients: ["monosodium glutamate","msg","ajinomoto","e621","ins621"]
- Hindi/Hinglish queries: treat "bina X", "X nahi", "X mat", "X ke bina" as meaning "without X" — same as English negation.
- Keep explanation under 22 words.
`;

const NON_PRODUCT_TERMS = new Set<string>([]);

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

// ────────────────────────────────────────────────────────────────────────────
// Negation constraint detection — applied in both heuristic + LLM fallback paths.
// Handles English AND Hindi/Hinglish phrasing for each ingredient to avoid.
//
// HOW IT WORKS:
//   Each entry maps a set of user-phrase patterns → the canonical avoid_ingredients
//   strings that the ingredient-check functions know how to match against.
//   The ingredient-check functions then use broad regex (not just string.includes)
//   to catch all labelling variants (e.g. "palmolein", "Rapeseed and Palm", etc.).
// ────────────────────────────────────────────────────────────────────────────

type NegationRule = {
  /** Regex matching user phrases that mean "avoid this ingredient" */
  detect: RegExp;
  /** Canonical avoid_ingredients tokens passed to the filter */
  ingredients?: string[];
  /** Sublabels (from Scout scoring) that indicate presence */
  sublabels?: string[];
  /** Human-readable soft_preference note */
  preference?: string;
};

const NEGATION_RULES: NegationRule[] = [
  // ── Palm oil ──────────────────────────────────────────────────────────
  // English: no palm oil, without palm oil, palm oil free, palm-oil-free
  // Hindi/Hinglish: bina palm oil, palm oil nahi, palm oil mat, palm tel nahi
  {
    detect: /\b(no|without|free(\s+from)?|bina|nahi|mat|avoid)\b.*\bpalm\b|\bpalm\b.*(free|nahi|nah[i]?|mat)\b|\bpalm.?oil.?free\b/i,
    ingredients: ["palm oil", "palmolein", "palm stearin", "palm kernel", "palm fat", "palm"],
  },
  // ── Maida / refined flour ─────────────────────────────────────────────
  // English: no maida, without maida, maida-free, no refined flour
  // Hindi: bina maida, maida nahi, maida mat
  {
    detect: /\b(no|without|free(\s+from)?|bina|nahi|mat)\b.*\bmaida\b|\bmaida\b.*(free|nahi|mat)\b|\bno refined (wheat )?flour\b/i,
    ingredients: ["maida", "refined wheat flour", "refined flour", "all purpose flour", "wheat flour (refined)", "refined wheat"],
  },
  // ── Preservatives ─────────────────────────────────────────────────────
  // English: no preservatives, without preservatives, preservative-free
  // Hindi: bina parirakshak, preservative nahi
  {
    detect: /\b(no|without|free(\s+from)?|bina|nahi|mat)\b.*\bpreservat|\bpreservat.*\b(free|nahi|mat)\b|\bparirakshak\b/i,
    ingredients: [],
    sublabels: ["contains_preservatives"],
    preference: "no preservatives",
  },
  // ── Artificial colours/colors ────────────────────────────────────────
  // English: no artificial colour/color, without artificial colours
  // Hindi: artificial rang nahi, rang nahi, nakli rang nahi
  {
    detect: /\b(no|without|bina|nahi|mat)\b.*\b(artificial|synthetic|nakli)\b.*\b(colo(?:u)?r|rang)\b|\b(artificial|nakli)\b.*\b(colo(?:u)?r|rang)\b.*\b(nahi|free|mat)\b/i,
    sublabels: ["artificial_colors"],
    preference: "no artificial colours",
  },
  // ── Artificial flavours/flavors ──────────────────────────────────────
  // English: no artificial flavour/flavor, without artificial flavouring
  // Hindi: artificial flavour nahi, nakli swad nahi
  {
    detect: /\b(no|without|bina|nahi|mat)\b.*\b(artificial|synthetic|nakli)\b.*\b(flavou?r|swad)\b|\b(artificial|nakli)\b.*\b(flavou?r|swad)\b.*\b(nahi|free|mat)\b/i,
    sublabels: ["artificial_flavors"],
    preference: "no artificial flavours",
  },
  // ── Artificial additives (both colour + flavour) ─────────────────────
  {
    detect: /\b(no|without|bina|nahi)\b.*\bartificial\b(?!.*natural)|\bartificial.*(free|nahi|mat)\b/i,
    sublabels: ["artificial_colors", "artificial_flavors"],
    preference: "no artificial additives",
  },
  // ── Added sugar ───────────────────────────────────────────────────────
  // (also handled in main body for max_sugar — this catches sublabel path)
  {
    detect: /\b(no|without|bina|nahi)\b.*\badded sugar\b|\badded sugar.*(nahi|free|mat)\b|\bchini nahi\b|\bbina chini\b/i,
    sublabels: ["hidden_sweetener"],
    preference: "no added sugar",
  },
  // ── MSG / monosodium glutamate ────────────────────────────────────────
  {
    detect: /\b(no|without|bina|nahi)\b.*\b(msg|monosodium glutamate|ajinomoto)\b/i,
    ingredients: ["monosodium glutamate", "msg", "ajinomoto", "e621", "ins621"],
  },
  // ── Artificial sweeteners ─────────────────────────────────────────────
  {
    detect: /\b(no|without|bina|nahi)\b.*\b(artificial sweetener|aspartame|sucralose|saccharin|acesulfame|stevia(?:\s+nahi)?)\b/i,
    sublabels: ["hidden_sweetener"],
    preference: "no artificial sweeteners",
  },
];

/**
 * Apply all negation constraint rules to a parsed query.
 * Called from both the heuristic parser and as a post-processing step.
 * Idempotent — safe to call multiple times.
 */
export function applyNegationConstraints(parsed: ParsedProductQuery, lower: string): void {
  for (const rule of NEGATION_RULES) {
    if (!rule.detect.test(lower)) continue;

    if (rule.ingredients?.length) {
      const existing = new Set(parsed.hard_constraints.avoid_ingredients ?? []);
      for (const ing of rule.ingredients) {
        existing.add(ing);
      }
      parsed.hard_constraints.avoid_ingredients = [...existing];
    }

    if (rule.sublabels?.length) {
      const existing = new Set(parsed.hard_constraints.avoid_sublabels ?? []);
      for (const s of rule.sublabels) {
        existing.add(s);
      }
      parsed.hard_constraints.avoid_sublabels = [...existing];
    }

    if (rule.preference && !parsed.soft_preferences.includes(rule.preference)) {
      parsed.soft_preferences.push(rule.preference);
    }
  }
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
  // ── Negation constraints — English + Hindi/Hinglish ────────────────────
  applyNegationConstraints(parsed, lower);

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
  stripAvoidedTermsFromSearchTerms(parsed);

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

/**
 * Remove terms from product_terms and search_keywords that also appear
 * in avoid_ingredients, so "no maida" / "no palm oil" etc. do NOT become
 * keyword signals that boost "Zero Maida" or "Zero Palm Oil" branded products.
 *
 * Strips exact matches AND partial-root matches
 * (avoiding "palm oil" also strips "palm" from search terms).
 */
function stripAvoidedTermsFromSearchTerms(parsed: ParsedProductQuery): void {
  const avoidRoots = (parsed.hard_constraints.avoid_ingredients ?? [])
    .map((a) => a.toLowerCase().split(/\s+/)[0]!)   // e.g. "palm oil" → "palm"
    .filter(Boolean);

  if (!avoidRoots.length) return;

  const isAvoided = (term: string): boolean => {
    const t = term.toLowerCase();
    return avoidRoots.some(
      (root) => t === root || t.startsWith(root + " ") || t.endsWith(" " + root) || t.includes(" " + root + " "),
    );
  };

  parsed.product_terms = parsed.product_terms.filter((t) => !isAvoided(t));
  parsed.search_keywords = parsed.search_keywords.filter((t) => !isAvoided(t));
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
  // Remove avoided ingredients from search terms so they don't become
  // positive keyword signals. E.g. "no maida" must not boost "Zero Maida" branded products.
  // Also removes partial-match roots: avoiding "palm oil" strips "palm" too.
  stripAvoidedTermsFromSearchTerms(parsed);
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

import { Agent, fetch as undiciFetch } from "undici";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

const dispatcher = new Agent({
  connect: { rejectUnauthorized: false, timeout: 20_000 },
  bodyTimeout: 120_000,
  headersTimeout: 60_000,
});

export type ParsedHealthContext =
  | "diabetic"
  | "pcos"
  | "kids"
  | "gym"
  | "fat_loss"
  | "bulk";

export type ParsedSortIntent =
  | "best_match"
  | "healthiest"
  | "cheapest"
  | "highest_protein";

export type ParsedProductQuery = {
  product_terms: string[];
  categories: string[];
  hard_constraints: {
    max_price?: number;
    max_sugar_g_100g?: number;
    max_fat_g_100g?: number;
    min_protein_g_100g?: number;
    vegetarian?: boolean;
    avoid_ingredients?: string[];
    allergens_excluded?: string[];
  };
  soft_preferences: string[];
  health_contexts: ParsedHealthContext[];
  sort_intent: ParsedSortIntent;
  explanation: string;
};

export type QueryParseResult = {
  parsed: ParsedProductQuery;
  source: "deepseek" | "heuristic";
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
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
  "categories": string[],
  "hard_constraints": {
    "max_price"?: number,
    "max_sugar_g_100g"?: number,
    "max_fat_g_100g"?: number,
    "min_protein_g_100g"?: number,
    "vegetarian"?: boolean,
    "avoid_ingredients"?: string[],
    "allergens_excluded"?: string[]
  },
  "soft_preferences": string[],
  "health_contexts": ("diabetic"|"pcos"|"kids"|"gym"|"fat_loss"|"bulk")[],
  "sort_intent": "best_match"|"healthiest"|"cheapest"|"highest_protein",
  "explanation": string
}

Rules:
- product_terms are concrete food/product words from the user: biscuits, paneer, chips, cereal, protein bar.
- categories are broad aisle/shelf hints only when obvious: snacks, dairy, breakfast, bakery, sweets, sauces.
- Use hard constraints only when the user asks for a limit or strict requirement.
- "low sugar" means max_sugar_g_100g = 10 unless a numeric limit is given.
- "no sugar" or "zero sugar" means max_sugar_g_100g = 1.
- "low fat" means max_fat_g_100g = 12 unless a numeric limit is given.
- "high protein" means min_protein_g_100g = 12 unless a numeric limit is given.
- Map gym/high protein to health_contexts:["gym"]; fat loss/weight loss to ["fat_loss"]; diabetic/diabetes to ["diabetic"]; PCOS to ["pcos"]; kids/children to ["kids"]; bulking/weight gain to ["bulk"].
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
]);

function emptyParsed(prompt: string): ParsedProductQuery {
  return {
    product_terms: prompt
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 3 && !NON_PRODUCT_TERMS.has(w))
      .slice(0, 4),
    categories: [],
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
  else if (/low sugar|less sugar|diabetic|diabetes|pcos/.test(lower)) {
    parsed.hard_constraints.max_sugar_g_100g = 10;
  }

  const fatLimit = firstNumberNear(lower, /(?:fat)\D{0,12}(\d{1,3})\s*g/);
  if (fatLimit) parsed.hard_constraints.max_fat_g_100g = fatLimit;
  else if (/low fat|less fat/.test(lower)) parsed.hard_constraints.max_fat_g_100g = 12;

  const proteinMin = firstNumberNear(lower, /(?:protein)\D{0,12}(\d{1,3})\s*g/);
  if (proteinMin) parsed.hard_constraints.min_protein_g_100g = proteinMin;
  else if (/high protein|protein rich|gym/.test(lower)) parsed.hard_constraints.min_protein_g_100g = 12;

  if (/veg|vegetarian/.test(lower)) parsed.hard_constraints.vegetarian = true;
  if (/palm oil/.test(lower)) parsed.hard_constraints.avoid_ingredients = ["palm oil"];
  if (/gluten/.test(lower)) parsed.hard_constraints.allergens_excluded = ["gluten"];

  if (/diabetic|diabetes/.test(lower)) parsed.health_contexts.push("diabetic");
  if (/pcos/.test(lower)) parsed.health_contexts.push("pcos");
  if (/kids|children|child/.test(lower)) parsed.health_contexts.push("kids");
  if (/gym|high protein|protein rich/.test(lower)) parsed.health_contexts.push("gym");
  if (/fat loss|weight loss|diet/.test(lower)) parsed.health_contexts.push("fat_loss");
  if (/bulk|bulking|weight gain/.test(lower)) parsed.health_contexts.push("bulk");

  if (/cheap|cheapest|budget|under|below/.test(lower)) parsed.sort_intent = "cheapest";
  if (/high protein|protein rich/.test(lower)) parsed.sort_intent = "highest_protein";
  if (/healthy|healthiest|best/.test(lower)) parsed.sort_intent = "healthiest";

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

  return {
    product_terms: asStringArray(record.product_terms).length
      ? asStringArray(record.product_terms)
      : fallback.product_terms,
    categories: asStringArray(record.categories),
    hard_constraints: {
      max_price: asNumber(constraints.max_price),
      max_sugar_g_100g: asNumber(constraints.max_sugar_g_100g),
      max_fat_g_100g: asNumber(constraints.max_fat_g_100g),
      min_protein_g_100g: asNumber(constraints.min_protein_g_100g),
      vegetarian: typeof constraints.vegetarian === "boolean" ? constraints.vegetarian : undefined,
      avoid_ingredients: asStringArray(constraints.avoid_ingredients),
      allergens_excluded: asStringArray(constraints.allergens_excluded),
    },
    soft_preferences: asStringArray(record.soft_preferences),
    health_contexts: contexts,
    sort_intent: VALID_SORTS.has(sort as ParsedSortIntent) ? sort as ParsedSortIntent : "best_match",
    explanation:
      typeof record.explanation === "string" && record.explanation.trim()
        ? record.explanation.trim().slice(0, 180)
        : fallback.explanation,
  };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("DeepSeek returned no JSON object");
  return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
}

export async function parseProductQueryWithDeepseek(
  prompt: string,
  opts: DeepseekOptions = {},
): Promise<QueryParseResult> {
  const apiKey = opts.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      parsed: heuristicParseProductQuery(prompt),
      source: "heuristic",
      warning: "DEEPSEEK_API_KEY is missing; used local parser fallback.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 18_000);
  try {
    const baseUrl = (opts.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, "");
    const res = await undiciFetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      dispatcher,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL,
        temperature: 0,
        max_tokens: 900,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: QUERY_PARSER_SYSTEM_PROMPT },
          { role: "user", content: `User grocery request: ${prompt}` },
        ],
      }),
    });
    const body = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: QueryParseResult["usage"];
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(body.error?.message ?? `DeepSeek HTTP ${res.status}`);
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("DeepSeek returned no message content");
    return {
      parsed: normalizeParsedProductQuery(extractJsonObject(content), prompt),
      source: "deepseek",
      usage: body.usage ?? null,
    };
  } catch (error) {
    return {
      parsed: heuristicParseProductQuery(prompt),
      source: "heuristic",
      warning: `DeepSeek parser failed; used local parser fallback (${(error as Error).message}).`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

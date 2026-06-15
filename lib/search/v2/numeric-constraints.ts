/**
 * §0.2 Allowed deterministic extraction — explicit numeric/comparator constraints only.
 * No semantic language rules.
 */
import type { IndexCatalogMeta } from "@/lib/search/v2/index-meta";
import type { SearchIntentV2 } from "@/lib/search/v2/types";

export type NumericExtraction = {
  max_price?: number;
  max_sugar_g?: number;
  max_fat_g?: number;
  max_calories?: number;
  min_protein_g?: number;
  high_protein_tier: boolean;
  low_sugar_tier: boolean;
  no_added_sugar: boolean;
  vegan?: boolean;
  vegetarian?: boolean;
  gluten_free?: boolean;
  palm_oil_free?: boolean;
  sort: SearchIntentV2["sort"];
  comparison_ref?: string;
  comparison_mode?: SearchIntentV2["comparison_mode"];
  /** Query text with numeric/limit phrases stripped for fast-path residual test */
  residual_text: string;
};

function firstNumber(text: string, pattern: RegExp): number | undefined {
  const m = text.match(pattern);
  if (!m?.[1]) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Extract numeric constraints and magnitude modifiers (high protein, low sugar).
 * Strips matched phrases into residual_text for fast-path coverage test.
 */
export function extractNumericConstraints(rawQuery: string): NumericExtraction {
  let text = rawQuery.toLowerCase();
  const out: NumericExtraction = {
    high_protein_tier: false,
    low_sugar_tier: false,
    no_added_sugar: false,
    sort: "best_match",
    residual_text: rawQuery.trim(),
  };

  const maxPrice =
    // Negative lookahead: "under 100 calories" / "below 150 kcal" / "under 20g" are
    // nutrient limits, not prices — don't capture them here.
    firstNumber(
      text,
      /(?:under|below|less than|<|₹|rs\.?|inr)\s*(\d{2,5})(?!\d)(?!\s*(?:k?cal|calorie|gm?\b|gram|ml\b|%))/,
    ) ?? firstNumber(text, /(\d{2,5})\s*(?:rs|rupees|inr|₹)/);
  if (maxPrice) {
    out.max_price = maxPrice;
    // Only strip price-related patterns, not nutrient quantities
    text = text.replace(/\b\d{2,5}\s*(?:rs|rupees|inr|₹)\b/gi, " ");
    text = text.replace(/(?:rs\.?|inr|₹)\s*\d{2,5}\b/gi, " ");
  }

  const sugarLimit =
    firstNumber(text, /(\d{1,3})\s*g\s*sugar/) ??
    firstNumber(text, /(?:sugar)\D{0,12}(\d{1,3})\s*g/) ??
    firstNumber(text, /(?:under|below|less than)\s*(\d{1,3})\s*g\s*sugar/);
  // "zero / no / no-added / without / sugar-free sugar" all express the NO-ADDED-SUGAR intent.
  // Flag it, but DON'T hard-gate total sugar — a 1g cap filtered out naturally-sweet items
  // (coconut water, plain yoghurt, fruit). Ranking handles "added sugar" softly.
  if (/zero sugar|no sugar|no added sugar|without sugar|without added sugar|sugar[\s-]free/.test(text)) {
    out.no_added_sugar = true;
    text = text.replace(/\b(zero sugar|no sugar|no added sugar|without sugar|without added sugar|sugar[\s-]free)\b/g, " ");
  }
  if (out.max_sugar_g == null && sugarLimit) out.max_sugar_g = sugarLimit;
  if (out.max_sugar_g == null && /low sugar|less sugar|lower sugar/.test(text)) {
    out.low_sugar_tier = true;
    text = text.replace(/\b(low sugar|less sugar|lower sugar)\b/g, " ");
  }

  const fatLimit = firstNumber(text, /(?:fat)\D{0,12}(\d{1,3})\s*g/) ??
    firstNumber(text, /(\d{1,3})\s*g\s*fat/) ??
    firstNumber(text, /(?:less than|under|below)\s*(\d{1,3})\s*g\s*fat/);
  if (fatLimit) out.max_fat_g = fatLimit;
  // "fat free" / "no fat" — strip from residual so fast-path doesn't match fat products
  text = text.replace(/\b(fat[\s-]free|no fat|lower fat|less fat)\b/gi, " ");

  const proteinMin = firstNumber(text, /(?:protein)\D{0,12}(\d{1,3})\s*g/) ??
    firstNumber(text, /(?:more than|at least|min)\s*(\d{1,3})\s*g\s*protein/) ??
    firstNumber(text, /(\d{1,3})\s*g\s*protein/);
  if (proteinMin) out.min_protein_g = proteinMin;

  // Dietary flags — explicit keywords → hard constraints. Strip from the text so
  // the residual (used for fast-path type/brand matching) doesn't mismatch, e.g.
  // "palm oil free biscuits" must not match "oil"/palmolein products.
  if (/\bvegan\b/.test(text)) {
    out.vegan = true;
    text = text.replace(/\bvegan\b/g, " ");
  }
  if (/\bvegetarian\b/.test(text)) {
    out.vegetarian = true;
    text = text.replace(/\bvegetarian\b/g, " ");
  }
  if (/\bgluten[\s-]?free\b/.test(text)) {
    out.gluten_free = true;
    text = text.replace(/\bgluten[\s-]?free\b/g, " ");
  }
  if (/\bpalm[\s-]?oil[\s-]?free\b/.test(text) || /\b(?:no|without)\s+palm\s*oil\b/.test(text)) {
    out.palm_oil_free = true;
    text = text
      .replace(/\bpalm[\s-]?oil[\s-]?free\b/g, " ")
      .replace(/\b(?:no|without)\s+palm\s*oil\b/g, " ");
  }

  // Explicit calorie ceiling ("under 100 calories", "150 kcal"). Vague "low calorie"
  // (no number) is intentionally left for the LLM → goal_phrase → low_calorie_density trait.
  const calLimit =
    firstNumber(text, /(?:under|below|less than|max|<)\s*(\d{2,4})\s*(?:k?cal|calorie|calories)/) ??
    firstNumber(text, /(\d{2,4})\s*(?:k?cal|calorie|calories)/);
  if (calLimit) out.max_calories = calLimit;

  if (/\b(highest protein|higher protein|high protein|most protein|more protein)\b/.test(text)) {
    out.high_protein_tier = true;
    out.sort = "highest_protein";
    text = text.replace(/\b(highest protein|higher protein|high protein|most protein|more protein)\b/g, " ");
  }
  // Bare "cheaper" sorts by price; "cheaper than X" must fall through to the
  // comparison branch below, so exclude it here.
  if (/\b(cheapest|cheaper(?!\s+than)|cheap|budget|lowest price)\b/.test(text)) {
    out.sort = "cheapest";
    text = text.replace(/\b(cheapest|cheaper(?!\s+than)|cheap|budget|lowest price)\b/g, " ");
  }
  const healthierThan = text.match(/\bhealthier\s+than\s+(.+?)(?:\s+under|\s+below|$)/);
  const cheaperThan = text.match(/\bcheaper\s+than\s+(.+?)(?:\s+under|\s+below|$)/);
  if (healthierThan?.[1]) {
    out.comparison_ref = healthierThan[1].trim();
    out.comparison_mode = "healthier_than";
    out.sort = "healthiest";
    text = text.replace(/\bhealthier\s+than\s+.+/, " ");
  } else if (cheaperThan?.[1]) {
    out.comparison_ref = cheaperThan[1].trim();
    out.comparison_mode = "cheaper_than";
    out.sort = "cheapest";
    text = text.replace(/\bcheaper\s+than\s+.+/, " ");
  } else if (/\b(healthiest|cleanest)\b/.test(text)) {
    out.sort = "healthiest";
    text = text.replace(/\b(healthiest|cleanest)\b/g, " ");
  }
  if (/\b(lowest sugar|least sugar)\b/.test(text)) {
    out.sort = "lowest_sugar";
    text = text.replace(/\b(lowest sugar|least sugar)\b/g, " ");
  }

  out.residual_text = text
    .replace(/\b(under|below|over|above|less than|more than|max|min)\b/gi, " ")
    .replace(/\b\d+(\.\d+)?\s*(g|gm|kg|ml|l|kcal|cal|%)\b/gi, " ")
    .replace(/(?:₹|rs\.?|inr)\s*\d+/gi, " ")
    // Strip constraint phrases so fast-path doesn't match them as types or brands
    .replace(/\b(dairy[\s-]free|lactose[\s-]free|calorie[\s-]free|sugar[\s-]free|fat[\s-]free|no fat|less fat|lower fat|no sugar|zero sugar|without sugar|without added sugar)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return out;
}

export function countActiveConstraints(n: NumericExtraction): number {
  let c = 0;
  if (n.max_price != null) c++;
  if (n.max_sugar_g != null) c++;
  if (n.max_fat_g != null) c++;
  if (n.max_calories != null) c++;
  if (n.min_protein_g != null) c++;
  if (n.high_protein_tier) c++;
  if (n.low_sugar_tier) c++;
  if (n.no_added_sugar) c++;
  if (n.vegan) c++;
  if (n.vegetarian) c++;
  if (n.gluten_free) c++;
  if (n.palm_oil_free) c++;
  return c;
}

/** Fast-path eligible when any token (or consecutive pair) is a known brand or primary_type (§6). */
export function fastPathEligible(residual: string, meta: IndexCatalogMeta): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/['']/g, "").trim();
  const fullNorm = norm(residual);

  // §6.1 — Long queries (>10 tokens) fall through to LLM to parse complex constraints
  const rawTokens = fullNorm.split(/\s+/);
  if (rawTokens.length > 10) return false;

  // §6.2 — Strip negation-prefixed tokens ("no dairy", "bina cheeni", "without oil").
  // Tokens following a negation word are excluded from brand/type matching so we
  // don't return products OF the thing the user said no to.
  // NOTE: "free" is NOT a prefix negation word — it's suffix-style ("sugar-free"
  // means "no sugar", not "free sugar"). Suffix-negation is handled by the LLM path.
  const NEGATION_WORDS = new Set(["no", "not", "without", "bina", "bagair", "nahi", "nako"]);
  const safeTokens: string[] = [];
  let negCount = 0;
  for (let i = 0; i < rawTokens.length; i++) {
    if (NEGATION_WORDS.has(rawTokens[i]!) && i + 1 < rawTokens.length) {
      negCount++;
      i++; // skip the negated token
      continue;
    }
    safeTokens.push(rawTokens[i]!);
  }

  const tokens = safeTokens.filter((t) => t.length >= 2);
  if (!tokens.length) return false;

  // §6.2a — Negation gate: ANY negation in a multi-token query indicates
  // ingredient/dietary constraints that fast-path cannot enforce. Route to LLM.
  // LLM prompt §3 (llm-intent.ts:73) handles "no X" → avoid_ingredients: [X] and
  // corrects typos naturally ("malodextrinn" → "maltodextrin").
  // 3-token minimum preserves single-word fast-path for zero-negation queries.
  if (negCount >= 1 && rawTokens.length >= 3) {
    return false;
  }

  // §6.3 — Check the full residual string first — handles multi-word brands like
  // "karachi bakery" where individual tokens won't match the stored brand name.
  if (meta.brands.has(fullNorm) || meta.primaryTypes.has(fullNorm)) return true;

  // §6.4 — Confidence ratio: for queries with >3 tokens, at least 40% of tokens
  // must be known catalog terms. Prevents single-incidental-token hijack
  // ("memory sharp karne ka food" → "sharp" matched brand → wrong intent).
  if (tokens.length > 3) {
    const knownCount = tokens.filter((t) => meta.brands.has(t) || meta.primaryTypes.has(t)).length;
    // Also count pair matches
    let pairMatches = 0;
    for (let i = 0; i < tokens.length - 1; i++) {
      const pair = tokens[i]! + " " + tokens[i + 1]!;
      if (meta.brands.has(pair) || meta.primaryTypes.has(pair)) pairMatches++;
    }
    // Each pair match counts as 2 known tokens
    const effective = knownCount + pairMatches * 2;
    if (effective / tokens.length < 0.4) return false;

    // §6.4a — Single-brand ambiguity: for 4+ token queries where only a
    // single-token brand was matched (no pairs) and ≤1 individual type, the
    // brand is likely incidental ("satvik diet snacks" → user means sattvic
    // diet, not the Satvik brand). Route to LLM for disambiguation.
    const indivBrands = tokens.filter((t) => meta.brands.has(t));
    const indivTypes = tokens.filter((t) => meta.primaryTypes.has(t));
    if (indivBrands.length > 0 && pairMatches === 0 && indivTypes.length <= 1) {
      return false;
    }
  }

  // Any token matches a brand or type → eligible
  if (tokens.some((t) => meta.brands.has(t) || meta.primaryTypes.has(t))) return true;

  // Check consecutive pairs for multi-word brands ("slurrp farm", "karachi bakery")
  for (let i = 0; i < tokens.length - 1; i++) {
    const pair = tokens[i]! + " " + tokens[i + 1]!;
    if (meta.brands.has(pair) || meta.primaryTypes.has(pair)) return true;
  }

  return false;
}

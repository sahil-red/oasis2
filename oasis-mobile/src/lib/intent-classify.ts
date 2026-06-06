/** Local intent routing for the single search box — mobile copy of lib/search/intent-classify.ts */

import {
  buildProductTypeSet,
  normalizeBrandSet,
  type IntentSignalOpts,
} from "@/lib/catalog-intent-signals";

export type SearchIntentTier = "lexical" | "structured" | "complex";

const CONSTRAINT_PATTERNS = [
  /\b(high|low|less|more|no|without|zero|under|below|over|above|max|min|least|most)\b/i,
  /\b(sugar|protein|fat|sodium|salt|fibre|fiber|calorie|calories|kcal|carb|carbs)\b/i,
  /\b(preservative|additives?|palm oil|maida|gluten|vegan|vegetarian|veg\b|jaggery|sweetener)\b/i,
  /\b(diabetic|diabetes|pcos|keto|gym|kids|children|weight loss|fat loss|bulk|bulking)\b/i,
  /\b(healthy|healthiest|healthier|cleanest|clean|nutritious|wholesome|best|cheapest|budget)\b/i,
  /(?:₹|rs\.?|inr)\s*\d{2,5}/i,
  /\d{1,3}\s*g\b/i,
  /\badded sugar\b/i,
  /\bno added\b/i,
];

const MODIFIER_PATTERNS = [
  /\borganic\b/i,
  /\bnatural\b/i,
  /\bsugar[\s-]?free\b/i,
  /\bgluten[\s-]?free\b/i,
  /\bdairy[\s-]?free\b/i,
  /\bzero[\s-]?sugar\b/i,
  /\bno[\s-]?added\b/i,
  /\bartificial\b/i,
  /\bpreservative/i,
  /\bpalm[\s-]?oil\b/i,
  /\bgrass[\s-]?fed\b/i,
  /\bketo[\s-]?friendly\b/i,
  /\bfriendly\b/i,
];

function normalizeQuery(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(raw: string): string[] {
  return normalizeQuery(raw)
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2);
}

export function hasConstraintLexicon(raw: string): boolean {
  const q = normalizeQuery(raw);
  return CONSTRAINT_PATTERNS.some((re) => re.test(q));
}

export function hasModifierLexicon(raw: string): boolean {
  const q = normalizeQuery(raw);
  return MODIFIER_PATTERNS.some((re) => re.test(q));
}

const NON_BRAND_TOKENS = new Set([
  "something",
  "anything",
  "everything",
  "nothing",
  "options",
  "option",
  "snacks",
  "snack",
  "meals",
  "meal",
  "food",
  "foods",
]);

function looksLikeBrandToken(token: string, brands?: Set<string>): boolean {
  const t = token.toLowerCase();
  if (NON_BRAND_TOKENS.has(t)) return false;
  if (brands?.has(t)) return true;
  return t.length >= 3 && t.length <= 18 && /^[a-z][a-z0-9&'.-]*$/i.test(t);
}

function isGoalForPattern(q: string): boolean {
  return /\b(food|snacks?|meals?|options?|something)\s+for\s+(bulking|gym|kids|diet|weight|loss|diabetic|pcos|fat)/i.test(
    q,
  );
}

export function classifyIntent(
  raw: string,
  opts?: IntentSignalOpts & { brands?: Iterable<string> },
): SearchIntentTier {
  const q = normalizeQuery(raw);
  if (q.length < 2) return "lexical";

  const brandSet = normalizeBrandSet(opts?.brands);
  const productTypes = opts?.productTypes ?? buildProductTypeSet(opts?.subcategories);
  const isProductTypeNoun = (token: string) => productTypes.has(token.toLowerCase());

  const tokens = tokenize(q);
  const hasConstraints = hasConstraintLexicon(q);
  const hasModifier = hasModifierLexicon(q);
  const hasIntentSignals = hasConstraints || hasModifier;

  const ROUTING_STOPWORDS = new Set([
    "with",
    "low",
    "high",
    "less",
    "more",
    "no",
    "without",
    "under",
    "below",
    "over",
    "above",
    "and",
    "or",
    "for",
    "fat",
    "sugar",
    "protein",
    "rs",
    "inr",
    "rupees",
    "free",
    "zero",
    "organic",
    "natural",
    "keto",
    "friendly",
    "healthy",
    "healthiest",
    "clean",
    "best",
  ]);
  const contentTokens = tokens.filter(
    (t) => !ROUTING_STOPWORDS.has(t) && !/^\d+$/.test(t),
  );
  const hasProductNoun = contentTokens.some(
    (t) => isProductTypeNoun(t) || (brandSet ? brandSet.has(t) : false),
  );
  const hasProductNounOrShortBrand =
    hasProductNoun ||
    (tokens.length <= 3 &&
      contentTokens.some((t) => looksLikeBrandToken(t, brandSet ?? undefined)));

  if (isGoalForPattern(q)) {
    return "structured";
  }

  if (hasIntentSignals && hasProductNounOrShortBrand && contentTokens.length <= 5) {
    return "structured";
  }

  if (!hasIntentSignals) {
    if (tokens.length <= 3) {
      const allNouns =
        tokens.length > 0 &&
        tokens.every(
          (t) => isProductTypeNoun(t) || (brandSet ? brandSet.has(t) : looksLikeBrandToken(t)),
        );
      if (allNouns) return "lexical";
    }
    if (tokens.length === 1 && looksLikeBrandToken(tokens[0]!, brandSet ?? undefined)) {
      return "lexical";
    }
    if (tokens.length <= 2 && tokens.some((t) => isProductTypeNoun(t))) {
      return "lexical";
    }
  }

  if (hasConstraints && hasProductNounOrShortBrand && contentTokens.length <= 4) {
    return "structured";
  }

  const vagueWith =
    /\bwith\b/i.test(q) && !/\bwith\s+(low|high|no|less|zero|added)\b/i.test(q);
  if (
    contentTokens.length >= 6 ||
    /\b(and|that|something|anything|tiffin|meal|option)\b/i.test(q) ||
    /\bfor\s+(my|the|breakfast|lunch|school|tiffin)\b/i.test(q) ||
    vagueWith
  ) {
    return "complex";
  }

  if (hasIntentSignals) return "structured";
  return tokens.length <= 3 ? "lexical" : "structured";
}

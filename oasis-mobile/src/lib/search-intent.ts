/** Mirror of lib/search/intent-classify.ts for client-side routing. */

export type SearchIntentTier = "lexical" | "structured" | "complex";

const CONSTRAINT_PATTERNS = [
  /\b(high|low|less|more|no|without|zero|under|below|over|above|max|min|least|most)\b/i,
  /\b(sugar|protein|fat|sodium|salt|fibre|fiber|calorie|calories|kcal|carb|carbs)\b/i,
  /\b(preservative|additives?|palm oil|maida|gluten|vegan|vegetarian|veg\b|jaggery|sweetener)\b/i,
  /\b(diabetic|diabetes|pcos|keto|gym|kids|children|weight loss|fat loss|bulk|bulking)\b/i,
  /\b(healthiest|healthier|cleanest|best|cheapest|budget)\b/i,
  /(?:₹|rs\.?|inr)\s*\d{2,5}/i,
  /\d{1,3}\s*g\b/i,
  /\badded sugar\b/i,
  /\bno added\b/i,
];

const PRODUCT_TYPE_NOUNS = new Set([
  "namkeen", "biscuit", "biscuits", "cookie", "cookies", "oats", "oat", "milk", "paneer",
  "curd", "yogurt", "ghee", "butter", "cheese", "bread", "rice", "atta", "flour", "oil",
  "juice", "chips", "snack", "snacks", "chocolate", "protein", "powder", "masala", "tea",
  "coffee", "honey", "jam", "pickle", "noodles", "pasta", "cereal", "muesli", "granola",
  "bar", "bars", "drink", "drinks", "soda", "cola", "water", "lassi", "buttermilk",   "tofu",
  "soya",
  "soy",
]);

function normalizeQuery(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(raw: string): string[] {
  return normalizeQuery(raw).split(/[^a-z0-9]+/i).filter((t) => t.length >= 2);
}

function hasConstraintLexicon(raw: string): boolean {
  return CONSTRAINT_PATTERNS.some((re) => re.test(normalizeQuery(raw)));
}

function looksLikeBrandToken(token: string, brands?: Set<string>): boolean {
  if (brands?.has(token)) return true;
  return token.length >= 3 && token.length <= 18 && /^[a-z][a-z0-9&'.-]*$/i.test(token);
}

function isProductTypeNoun(token: string): boolean {
  return PRODUCT_TYPE_NOUNS.has(token.toLowerCase());
}

export function classifyIntent(
  raw: string,
  opts?: { brands?: Iterable<string> },
): SearchIntentTier {
  const q = normalizeQuery(raw);
  if (q.length < 2) return "lexical";

  const tokens = tokenize(q);
  const brandSet = opts?.brands ? new Set([...opts.brands].map((b) => b.toLowerCase())) : null;
  const hasConstraints = hasConstraintLexicon(q);

  if (!hasConstraints) {
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

  const ROUTING_STOPWORDS = new Set([
    "with", "low", "high", "less", "more", "no", "without", "under", "below", "over", "above",
    "and", "or", "for", "fat", "sugar", "protein", "rs", "inr", "rupees",
  ]);
  const contentTokens = tokens.filter(
    (t) => !ROUTING_STOPWORDS.has(t) && !/^\d+$/.test(t),
  );
  const hasProductNoun = contentTokens.some(
    (t) => isProductTypeNoun(t) || (brandSet ? brandSet.has(t) : false),
  );
  if (hasConstraints && hasProductNoun && contentTokens.length <= 4) {
    return "structured";
  }

  const vagueWith =
    /\bwith\b/i.test(q) && !/\bwith\s+(low|high|no|less|zero|added)\b/i.test(q);
  if (
    contentTokens.length >= 6 ||
    /\b(and|for|that|something|anything|tiffin|meal|option)\b/i.test(q) ||
    vagueWith
  ) {
    return "complex";
  }

  if (hasConstraints) return "structured";
  return tokens.length <= 3 ? "lexical" : "structured";
}

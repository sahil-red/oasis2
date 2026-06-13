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
  // "zero / no / no-added sugar" all express the NO-ADDED-SUGAR intent. Flag it,
  // but DON'T hard-gate total sugar — a 1g cap filtered out naturally-sweet items
  // (coconut water, plain yoghurt, fruit). Ranking handles "added sugar" softly.
  if (/zero sugar|no sugar|no added sugar/.test(text)) out.no_added_sugar = true;
  if (out.max_sugar_g == null && sugarLimit) out.max_sugar_g = sugarLimit;
  if (out.max_sugar_g == null && /low sugar|less sugar/.test(text)) {
    out.low_sugar_tier = true;
  }

  const fatLimit = firstNumber(text, /(?:fat)\D{0,12}(\d{1,3})\s*g/) ??
    firstNumber(text, /(\d{1,3})\s*g\s*fat/) ??
    firstNumber(text, /(?:less than|under|below)\s*(\d{1,3})\s*g\s*fat/);
  if (fatLimit) out.max_fat_g = fatLimit;

  const proteinMin = firstNumber(text, /(?:protein)\D{0,12}(\d{1,3})\s*g/) ??
    firstNumber(text, /(?:more than|at least|min)\s*(\d{1,3})\s*g\s*protein/) ??
    firstNumber(text, /(\d{1,3})\s*g\s*protein/);
  if (proteinMin) out.min_protein_g = proteinMin;

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
  return c;
}

/** Fast-path eligible when every residual token is a known brand or primary_type (§6). */
export function fastPathEligible(residual: string, meta: IndexCatalogMeta): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/['']/g, "").trim();
  const fullNorm = norm(residual);

  // Check the full residual string first — handles multi-word brands like
  // "karachi bakery" where individual tokens won't match the stored brand name.
  if (meta.brands.has(fullNorm) || meta.primaryTypes.has(fullNorm)) return true;

  const tokens = fullNorm
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (!tokens.length || tokens.length > 2) return false;
  if (tokens.length === 1) {
    return meta.brands.has(tokens[0]!) || meta.primaryTypes.has(tokens[0]!);
  }
  const [a, b] = tokens;
  return (
    (meta.brands.has(a!) && meta.primaryTypes.has(b!)) ||
    (meta.brands.has(b!) && meta.primaryTypes.has(a!))
  );
}

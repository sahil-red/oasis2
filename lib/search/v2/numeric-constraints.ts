/**
 * §0.2 Allowed deterministic extraction — explicit numeric/comparator constraints only.
 * No semantic language rules.
 */
import type { SearchIntentV2 } from "@/lib/search/v2/types";

export type NumericExtraction = {
  max_price?: number;
  max_sugar_g?: number;
  max_fat_g?: number;
  min_protein_g?: number;
  high_protein_tier: boolean;
  low_sugar_tier: boolean;
  no_added_sugar: boolean;
  sort: SearchIntentV2["sort"];
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
    firstNumber(text, /(?:under|below|less than|<|₹|rs\.?|inr)\s*(\d{2,5})/) ??
    firstNumber(text, /(\d{2,5})\s*(?:rs|rupees|inr|₹)/);
  if (maxPrice) {
    out.max_price = maxPrice;
    text = text.replace(/(?:under|below|less than|<|₹|rs\.?|inr)\s*\d{2,5}/g, " ");
    text = text.replace(/\d{2,5}\s*(?:rs|rupees|inr|₹)/g, " ");
  }

  const sugarLimit = firstNumber(text, /(?:sugar)\D{0,12}(\d{1,3})\s*g/);
  if (/zero sugar|no sugar|no added sugar/.test(text)) {
    out.max_sugar_g = 1;
    out.no_added_sugar = true;
  } else if (sugarLimit) {
    out.max_sugar_g = sugarLimit;
  } else if (/low sugar|less sugar/.test(text)) {
    out.low_sugar_tier = true;
    out.max_sugar_g = 10;
  }

  const fatLimit = firstNumber(text, /(?:fat)\D{0,12}(\d{1,3})\s*g/);
  if (fatLimit) out.max_fat_g = fatLimit;

  const proteinMin = firstNumber(text, /(?:protein)\D{0,12}(\d{1,3})\s*g/);
  if (proteinMin) out.min_protein_g = proteinMin;

  if (/\b(highest protein|high protein|most protein)\b/.test(text)) {
    out.high_protein_tier = true;
    out.sort = "highest_protein";
  }
  if (/\b(cheapest|cheap|budget|lowest price)\b/.test(text)) out.sort = "cheapest";
  if (/\b(healthiest|healthier|cleanest)\b/.test(text)) out.sort = "healthiest";
  if (/\b(lowest sugar|least sugar)\b/.test(text)) out.sort = "lowest_sugar";

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
  if (n.min_protein_g != null) c++;
  if (n.high_protein_tier) c++;
  if (n.low_sugar_tier) c++;
  if (n.no_added_sugar) c++;
  return c;
}

/** Fast-path gate: negation/flavour/goal phrasing requires LLM (§6). */
export function requiresLlmIntent(query: string): boolean {
  const q = query.toLowerCase();
  if (/\b(no|without|free from|bina|nahi|nut[\s-]?free|gluten[\s-]?free|vegan|for\s+\w+)\b/.test(q)) {
    return true;
  }
  if (/\b(healthy|healthiest|running|gym|diabetic|pcos|tiffin|junk|workout)\b/.test(q)) {
    return true;
  }
  return false;
}

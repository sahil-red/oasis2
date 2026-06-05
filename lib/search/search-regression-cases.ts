import type { SearchIntentTier } from "@/lib/search/intent-classify";
import type { ParsedSortIntent } from "@/lib/search/query-parse";

export type IntentCase = {
  query: string;
  expect: SearchIntentTier;
};

export type ParseCase = {
  query: string;
  check: (parsed: {
    product_terms: string[];
    sort_intent: ParsedSortIntent;
    hard_constraints: Record<string, unknown>;
    exclude_keywords: string[];
    soft_preferences: string[];
  }) => boolean;
};

export const INTENT_CASES: IntentCase[] = [
  { query: "namkeen", expect: "lexical" },
  { query: "amul", expect: "lexical" },
  { query: "oats", expect: "lexical" },
  { query: "paneer with low fat under ₹150", expect: "structured" },
  { query: "high protein milk", expect: "structured" },
  { query: "oats no added sugar", expect: "structured" },
  {
    query: "something healthy for my kids tiffin with options",
    expect: "complex",
  },
];

export const PARSE_CASES: ParseCase[] = [
  {
    query: "paneer under ₹150",
    check: (p) =>
      p.product_terms.includes("paneer") &&
      p.hard_constraints.max_price === 150 &&
      p.exclude_keywords.includes("masala"),
  },
  {
    query: "high protein milk",
    check: (p) =>
      p.product_terms.includes("milk") && p.sort_intent === "highest_protein",
  },
  {
    query: "low sugar biscuits",
    check: (p) =>
      p.hard_constraints.max_sugar_g_100g === 10 &&
      (p.product_terms.includes("biscuits") || p.product_terms.includes("biscuit")),
  },
  {
    query: "cheapest oats",
    check: (p) => p.sort_intent === "cheapest",
  },
  {
    query: "vegan protein bar",
    check: (p) => p.hard_constraints.vegan === true,
  },
  {
    query: "no preservatives juice",
    check: (p) =>
      p.product_terms.includes("juice") &&
      p.soft_preferences.some((s) => /preserv/i.test(s)),
  },
];

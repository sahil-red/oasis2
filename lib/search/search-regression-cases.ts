import type { SearchIntentTier } from "@/lib/search/intent-classify";
import type { ParsedProductQuery } from "@/lib/search/query-parse";

export type LiveSearchCase = {
  query: string;
  expectTier?: SearchIntentTier;
  tier?: SearchIntentTier;
  limit?: number;
  minResults?: number;
  checkTop?: number;
  topMustNotMatch?: RegExp;
  topMustMatch?: RegExp;
};

export type IntentCase = {
  query: string;
  expect: SearchIntentTier;
};

export type ParseCase = {
  query: string;
  check: (parsed: ParsedProductQuery) => boolean;
};

export const INTENT_CASES: IntentCase[] = [
  { query: "namkeen", expect: "lexical" },
  { query: "amul", expect: "lexical" },
  { query: "oats", expect: "lexical" },
  { query: "paneer with low fat under ₹150", expect: "structured" },
  { query: "high protein milk", expect: "structured" },
  { query: "oats no added sugar", expect: "structured" },
  { query: "healthy noodles", expect: "structured" },
  { query: "healthy maggi", expect: "structured" },
  { query: "organic milk", expect: "structured" },
  { query: "sugar free coke", expect: "structured" },
  { query: "food for bulking", expect: "structured" },
  { query: "low sugar biscuits", expect: "structured" },
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
    query: "food for bulking",
    check: (p) =>
      p.health_contexts.includes("bulk") &&
      p.product_terms.length === 0 &&
      p.exclude_keywords.some((k) => /cerelac|baby food/i.test(k)),
  },
  {
    query: "high protein buttermilk",
    check: (p) =>
      p.product_terms.includes("buttermilk") &&
      p.sort_intent === "highest_protein" &&
      p.exclude_keywords.includes("dal"),
  },
  {
    query: "milk high protein",
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
  {
    query: "low fat paneer for diet",
    check: (p) =>
      p.product_terms.includes("paneer") &&
      p.hard_constraints.max_fat_g_100g == null &&
      p.soft_preferences.some((s) => /low fat/i.test(s)) &&
      p.health_contexts.includes("fat_loss"),
  },
  {
    query: "diabetic friendly breakfast cereals",
    check: (p) =>
      p.health_contexts.includes("diabetic") &&
      p.hard_constraints.max_sugar_g_100g === 5 &&
      p.sort_intent === "healthiest",
  },
  {
    query: "healthy ragi biscuits for kids",
    check: (p) =>
      p.health_contexts.includes("kids") &&
      p.sort_intent === "healthiest" &&
      (p.product_terms.includes("ragi") || p.product_terms.includes("biscuits")),
  },
];

/** Live DB checks — run via pnpm search:regression:live */
export const LIVE_SEARCH_CASES: LiveSearchCase[] = [
  { query: "namkeen", expectTier: "lexical" },
  { query: "amul", expectTier: "lexical" },
  {
    query: "malai paneer",
    tier: "structured",
    expectTier: "structured",
    topMustMatch: /\bpaneer\b/i,
    topMustNotMatch: /masala|momo|biryani|burger|patty|tikka masala|ready to eat/i,
    checkTop: 8,
    minResults: 3,
  },
  { query: "paneer under ₹150", expectTier: "structured" },
  {
    query: "paneer with low fat under ₹150",
    expectTier: "structured",
  },
  { query: "ghee", expectTier: "lexical" },
  {
    query: "cow ghee under ₹500",
    expectTier: "structured",
    topMustNotMatch: /laddu|ladoo|barfi|mithai|soan|papdi|biscuit|namkeen/i,
    minResults: 4,
  },
  {
    query: "high protein milk",
    expectTier: "structured",
    topMustMatch: /epigamia|frubon|phab|horlicks|protein milk|protein shake|max protein|slim milk|hi.?pro|promilk|hilo|nourish/i,
    topMustNotMatch: /milk bread|bread/i,
    checkTop: 8,
    minResults: 4,
  },
  {
    query: "milk high protein",
    expectTier: "structured",
    topMustMatch: /frubon|promilk|protein milk|hilo|nourish|hi.?pro|epigamia|phab/i,
    topMustNotMatch: /milk bread/i,
    checkTop: 8,
    minResults: 4,
  },
  {
    query: "low sugar biscuits",
    expectTier: "structured",
    topMustNotMatch: /chocolate spread|masala|noodle/i,
    minResults: 4,
  },
  {
    query: "cheapest oats",
    expectTier: "structured",
    minResults: 4,
  },
  {
    query: "low fat paneer for diet",
    expectTier: "structured",
    minResults: 12,
    checkTop: 8,
    topMustMatch: /\bpaneer\b/i,
    topMustNotMatch: /^tofu$|^tempeh$|silken tofu|soyarich tofu/i,
  },
];

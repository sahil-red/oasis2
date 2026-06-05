/**
 * Lightweight regression checks for search routing + heuristic parse (no DB).
 * Run: pnpm search:regression
 */
import { classifyIntent } from "@/lib/search/intent-classify";
import { buildProductTypeSet } from "@/lib/search/catalog-intent-signals";
import { heuristicParseProductQuery } from "@/lib/search/query-parse";
import { isFalsePositiveProductLabel } from "@/lib/search/product-term-heuristics";
import { buildMatchReasons } from "@/lib/search/match-reasons";
import {
  healthContextGoalFit,
  healthIntentSortTier,
  rankCandidatesSemantically,
} from "@/lib/search/semantic-rank";
import type { ProductListItem } from "@/lib/products/queries";
import { INTENT_CASES, PARSE_CASES } from "@/lib/search/search-regression-cases";

const productTypes = buildProductTypeSet(["Fresh Paneer", "Biscuits & Cookies", "Fruit Juices"]);

let failed = 0;

for (const c of INTENT_CASES) {
  const got = classifyIntent(c.query, { productTypes });
  if (got !== c.expect) {
    console.error(`[intent] FAIL "${c.query}" → ${got} (expected ${c.expect})`);
    failed++;
  }
}

for (const c of PARSE_CASES) {
  const parsed = heuristicParseProductQuery(c.query);
  if (!c.check(parsed)) {
    console.error(`[parse] FAIL "${c.query}"`, JSON.stringify(parsed, null, 0).slice(0, 200));
    failed++;
  }
}

if (isFalsePositiveProductLabel("MDH Shahi Paneer Masala", "Spices", "paneer")) {
  console.log("[gate] paneer masala flagged as false positive ✓");
} else {
  console.error("[gate] FAIL paneer masala should be false positive");
  failed++;
}

if (isFalsePositiveProductLabel("Amul Fresh Paneer", "Fresh Paneer", "paneer")) {
  console.error("[gate] FAIL real paneer should not be false positive");
  failed++;
}

const chipsQuery = heuristicParseProductQuery("chips without palm oil");
const chipProduct = {
  id: "c1",
  slug: "c1",
  name: "Open Secret Spinach Chips",
  brand: "Open Secret",
  category: "Snacks",
  subcategory: "Chips",
  l3_category: "Chips",
  ingredients_raw: "potato, sunflower oil, salt, spinach powder",
  price_inr: 55,
  nutrition: { protein_g_100g: 5, sugar_g_100g: 2 },
  core_scores: {
    score: 55,
    grade: "C",
    band: "average",
    verdict: "occasional_treat",
    verdict_sublabels: ["mindful_portions"],
  },
} as ProductListItem;
const chipReasons = buildMatchReasons(chipProduct, chipsQuery);
if (!chipReasons.some((r) => /palm oil/i.test(r))) {
  console.error("[reasons] FAIL expected palm-oil chip, got", chipReasons);
  failed++;
}
if (chipReasons.some((r) => /under ₹/i.test(r))) {
  console.error("[reasons] FAIL should not repeat price budget in chips", chipReasons);
  failed++;
}

const diabeticQuery = heuristicParseProductQuery("diabetic friendly breakfast cereals");
const cerealCandidates = [
  {
    id: "low-sugar",
    slug: "low-sugar",
    name: "True Elements Whole Wheat Flakes",
    brand: "True Elements",
    category: "Breakfast",
    subcategory: "Cereals",
    l3_category: "Breakfast Cereals",
    ingredients_raw: "whole wheat, salt",
    price_inr: 299,
    nutrition: { sugar_g_100g: 0 },
    core_scores: { score: 72, verdict: "good", verdict_sublabels: [] },
  },
  {
    id: "high-sugar",
    slug: "high-sugar",
    name: "True Elements Dark Chocolate Granola",
    brand: "True Elements",
    category: "Breakfast",
    subcategory: "Cereals",
    l3_category: "Breakfast Cereals",
    ingredients_raw: "oats, jaggery, dark chocolate",
    price_inr: 349,
    nutrition: { sugar_g_100g: 14 },
    core_scores: { score: 68, verdict: "occasional_treat", verdict_sublabels: [] },
  },
] as ProductListItem[];

const diabeticRank = rankCandidatesSemantically(cerealCandidates, diabeticQuery, 2);
if (diabeticRank.rankings[0]?.product_id !== "low-sugar") {
  console.error(
    "[rank] FAIL diabetic cereals: expected 0g sugar first, got",
    diabeticRank.rankings.map((r) => r.product_id),
  );
  failed++;
}
const lowDiabeticFit = healthContextGoalFit(cerealCandidates[0]!, diabeticQuery);
const highDiabeticFit = healthContextGoalFit(cerealCandidates[1]!, diabeticQuery);
if (lowDiabeticFit == null || highDiabeticFit == null) {
  console.error("[rank] FAIL expected diabetic goal fit scores");
  failed++;
} else if (lowDiabeticFit <= highDiabeticFit) {
  console.error(
    "[rank] FAIL diabetic goal fit should favor 0g sugar",
    { lowDiabeticFit, highDiabeticFit },
  );
  failed++;
}
if (
  healthIntentSortTier(cerealCandidates[0]!, diabeticQuery) <=
  healthIntentSortTier(cerealCandidates[1]!, diabeticQuery)
) {
  console.error("[rank] FAIL diabetic health tier should favor low sugar");
  failed++;
}

const kidsQuery = heuristicParseProductQuery("healthy ragi biscuits for kids");
const biscuitCandidates = [
  {
    id: "clean-kids",
    slug: "clean-kids",
    name: "Early Foods Ragi Biscuits",
    brand: "Early Foods",
    category: "Snacks",
    subcategory: "Biscuits & Cookies",
    l3_category: "Biscuits",
    ingredients_raw: "ragi, jaggery, ghee",
    price_inr: 180,
    nutrition: { sugar_g_100g: 2 },
    core_scores: { score: 78, verdict: "good", verdict_sublabels: [] },
  },
  {
    id: "treat-kids",
    slug: "treat-kids",
    name: "Cream Filled Ragi Biscuits",
    brand: "Generic",
    category: "Snacks",
    subcategory: "Biscuits & Cookies",
    l3_category: "Biscuits",
    ingredients_raw: "ragi, maida, sugar, palm oil, preservatives E202",
    price_inr: 120,
    nutrition: { sugar_g_100g: 22 },
    core_scores: { score: 62, verdict: "occasional_treat", verdict_sublabels: ["hidden_sweetener"] },
  },
] as ProductListItem[];

const kidsRank = rankCandidatesSemantically(biscuitCandidates, kidsQuery, 2);
if (kidsRank.rankings[0]?.product_id !== "clean-kids") {
  console.error(
    "[rank] FAIL kids biscuits: expected healthier option first, got",
    kidsRank.rankings.map((r) => r.product_id),
  );
  failed++;
}

if (failed > 0) {
  console.error(`\n${failed} regression check(s) failed`);
  process.exit(1);
}

const rankChecks = 3;
console.log(
  `\nAll ${INTENT_CASES.length + PARSE_CASES.length + 2 + rankChecks} search regression checks passed.`,
);

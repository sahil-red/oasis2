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
  matchesPrimaryProductType,
  rankCandidatesSemantically,
  relevanceScore,
} from "@/lib/search/semantic-rank";
import type { ProductListItem } from "@/lib/products/queries";
import { retrieveCandidates } from "@/lib/search/ai-retrieval";
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

const buttermilkQuery = heuristicParseProductQuery("high protein buttermilk");
const buttermilkCandidates = [
  {
    id: "chaas",
    slug: "chaas",
    name: "Desi Farms Masala Chaas Bottle",
    brand: "Desi Farms",
    category: "Dairy",
    subcategory: "Buttermilk & Chaas",
    l3_category: "Buttermilk & Chaas",
    ingredients_raw: "curd, water, spices",
    price_inr: 45,
    nutrition: { protein_g_100g: 3.5 },
    core_scores: { score: 48, verdict: "occasional_treat", verdict_sublabels: [] },
  },
  {
    id: "dal",
    slug: "dal",
    name: "DeHaat HF Unpolished Moong Dal",
    brand: "DeHaat",
    category: "Staples",
    subcategory: "Dal & Pulses",
    l3_category: "Moong Dal",
    ingredients_raw: "moong dal",
    price_inr: 120,
    nutrition: { protein_g_100g: 24.5 },
    core_scores: { score: 84, verdict: "good", verdict_sublabels: [] },
  },
] as ProductListItem[];

if (relevanceScore(buttermilkCandidates[1]!, buttermilkQuery) > 0) {
  console.error("[gate] FAIL moong dal should not match high protein buttermilk");
  failed++;
}
if (!matchesPrimaryProductType(buttermilkCandidates[0]!, buttermilkQuery)) {
  console.error("[gate] FAIL chaas should match buttermilk query");
  failed++;
}
const buttermilkRank = rankCandidatesSemantically(buttermilkCandidates, buttermilkQuery, 2);
if (buttermilkRank.rankings[0]?.product_id !== "chaas") {
  console.error(
    "[rank] FAIL high protein buttermilk: expected chaas first, got",
    buttermilkRank.rankings.map((r) => r.product_id),
  );
  failed++;
}

const bulkingParsed = heuristicParseProductQuery("food for bulking");
const bulkingCandidates: ProductListItem[] = [
  {
    id: "cerelac",
    slug: "cerelac",
    name: "Nestle Cerelac Multigrain Baby Food Cereal",
    brand: "Nestle",
    category: "Baby Care",
    subcategory: "Infant Cereal",
    ingredients_raw: "milk solids",
    nutrition: {
      protein_g_100g: 15,
      energy_kcal_100g: 400,
      sugar_g_100g: 20,
      carbs_g_100g: 60,
    },
    price_inr: 322,
    mrp_inr: null,
    net_weight: null,
    image_urls: null,
    core_scores: { score: 81, grade: "B", band: "good", verdict_sublabels: [] },
  } as ProductListItem,
  {
    id: "paneer",
    slug: "paneer",
    name: "Amul Fresh Paneer",
    brand: "Amul",
    category: "Dairy",
    subcategory: "Paneer",
    ingredients_raw: "milk",
    nutrition: {
      protein_g_100g: 18,
      energy_kcal_100g: 265,
      fat_g_100g: 20,
    },
    price_inr: 90,
    mrp_inr: null,
    net_weight: null,
    image_urls: null,
    core_scores: { score: 75, grade: "B", band: "good", verdict_sublabels: [] },
  } as ProductListItem,
];
const bulkingRank = rankCandidatesSemantically(bulkingCandidates, bulkingParsed, 2);
if (bulkingRank.rankings.some((r) => r.product_id === "cerelac")) {
  console.error("[rank] FAIL food for bulking: infant cereal must not rank");
  failed++;
}
if (bulkingRank.rankings[0]?.product_id !== "paneer") {
  console.error(
    "[rank] FAIL food for bulking: expected paneer first, got",
    bulkingRank.rankings.map((r) => r.product_id),
  );
  failed++;
}

const rankChecks = 8;

const maggiParsed = heuristicParseProductQuery("healthy maggi noodles");
const maggiRank = rankCandidatesSemantically(
  [
    {
      id: "ketchup",
      slug: "k",
      name: "MAGGI Rich Tomato Ketchup",
      brand: "MAGGI",
      category: "Sauces",
      subcategory: "Ketchup",
      nutrition: { protein_g_100g: 1, sugar_g_100g: 22 },
      core_scores: { score: 70, grade: "C", band: "ok", verdict_sublabels: [] },
    } as ProductListItem,
    {
      id: "noodles",
      slug: "n",
      name: "MAGGI 2-Minute Masala Noodles",
      brand: "MAGGI",
      category: "Noodles",
      subcategory: "Instant Noodles",
      nutrition: { protein_g_100g: 8, energy_kcal_100g: 350 },
      core_scores: { score: 55, grade: "D", band: "poor", verdict_sublabels: [] },
    } as ProductListItem,
  ],
  maggiParsed,
  2,
);
if (maggiRank.rankings[0]?.product_id === "ketchup") {
  console.error("[rank] FAIL healthy maggi noodles: ketchup must not rank first");
  failed++;
}

const healthyNoodlesParsed = heuristicParseProductQuery("healthy noodles");
const healthyNoodleRank = rankCandidatesSemantically(
  [
    {
      id: "ramen",
      slug: "r",
      name: "Ottogi Yeul Ramen Noodle Single Pack",
      brand: "Ottogi",
      category: "Food",
      subcategory: "Instant Noodles",
      nutrition: { protein_g_100g: 5, sugar_g_100g: 2 },
      core_scores: {
        score: 31,
        grade: "D",
        band: "poor",
        verdict: "skip",
        verdict_sublabels: [],
      },
    } as ProductListItem,
    {
      id: "whole-wheat",
      slug: "w",
      name: "Yu Whole Wheat Hakka Noodles",
      brand: "Yu",
      category: "Food",
      subcategory: "Noodles & Vermicelli",
      nutrition: { protein_g_100g: 11, sugar_g_100g: 2 },
      core_scores: {
        score: 73,
        grade: "B",
        band: "good",
        verdict: "good_choice",
        verdict_sublabels: [],
      },
    } as ProductListItem,
  ],
  healthyNoodlesParsed,
  2,
);
if (healthyNoodleRank.rankings[0]?.product_id !== "whole-wheat") {
  console.error(
    "[rank] FAIL healthy noodles: expected whole wheat first, got",
    healthyNoodleRank.rankings.map((r) => r.product_id),
  );
  failed++;
}

const parentsParsed = heuristicParseProductQuery("protein for parents");
const parentsPool: ProductListItem[] = [
  {
    id: "baby",
    slug: "b",
    name: "Nestle Cerelac Baby Cereal",
    brand: "Nestle",
    category: "Baby",
    subcategory: "Infant Cereal",
    nutrition: { protein_g_100g: 15 },
    core_scores: { score: 80, grade: "B", band: "good", verdict_sublabels: [] },
  } as ProductListItem,
  {
    id: "dal",
    slug: "d",
    name: "Tata Sampann Toor Dal",
    brand: "Tata",
    category: "Staples",
    subcategory: "Dal",
    nutrition: { protein_g_100g: 22 },
    core_scores: { score: 78, grade: "B", band: "good", verdict_sublabels: [] },
  } as ProductListItem,
];
const parentsCands = retrieveCandidates(parentsPool, parentsParsed, 10);
if (!parentsCands.some((p) => p.id === "dal")) {
  console.error("[retrieve] FAIL protein for parents: expected high-protein staples in pool");
  failed++;
}
if (parentsCands.some((p) => p.id === "baby") && parentsCands[0]?.id === "baby") {
  console.error("[retrieve] FAIL protein for parents: baby cereal should not top pool");
  failed++;
}

if (failed > 0) {
  console.error(`\n${failed} regression check(s) failed`);
  process.exit(1);
}

console.log(
  `\nAll ${INTENT_CASES.length + PARSE_CASES.length + 2 + rankChecks} search regression checks passed.`,
);

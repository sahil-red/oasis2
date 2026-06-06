/**
 * Offline regression for Search V2 intent + enrichment (no DB).
 * Run: pnpm search:v2-regression
 */
import { enrichProductToIndexRow, finalizeIndexBatch } from "@/lib/search/v2/enrichment";
import { parseSearchIntent } from "@/lib/search/intent";
import { computeGoalFit } from "@/lib/search/v2/goal-graph";
import { generateCandidates } from "@/lib/search/v2/candidate-generation";
import { buildCategoryTraitProfiles } from "@/lib/search/v2/category-profiles";
import { rankCandidates } from "@/lib/search/v2/ranking";
import { V2_INTENT_CASES } from "@/lib/search/v2/v2-regression-cases";
import type { EnrichSource } from "@/lib/search/v2/enrichment";

const FIXTURES: EnrichSource[] = [
  {
    id: "1",
    slug: "smoothie-1",
    name: "True Elements Strawberry Smoothie Mix",
    brand: "True Elements",
    category: "Beverages",
    subcategory: "Smoothies",
    l3_category: "Smoothie Mix",
    net_weight: "200 g",
    price_inr: 199,
    mrp_inr: 220,
    nutrition: { protein_g_100g: 8, sugar_g_100g: 12, fiber_g_100g: 4, energy_kcal_100g: 380 },
    ingredients_raw: "strawberry, oats, honey",
    attributes: { "Diet Preference": "Vegetarian" },
    core_scores: { score: 72, grade: "B", band: "good", subscores: { nutrition: 45, additives: 22, labels: 5 }, concerns: [], computed_at: "" },
  },
  {
    id: "2",
    slug: "smoothie-2",
    name: "Yoga Bar Mango Smoothie",
    brand: "Yoga Bar",
    category: "Beverages",
    subcategory: "Drink Mixes",
    l3_category: null,
    net_weight: "250 g",
    price_inr: 249,
    mrp_inr: 299,
    nutrition: { protein_g_100g: 6, sugar_g_100g: 18, energy_kcal_100g: 400 },
    ingredients_raw: "mango, sugar, maltodextrin",
    attributes: null,
    core_scores: { score: 55, grade: "C", band: "poor", subscores: { nutrition: 30, additives: 15, labels: 5 }, concerns: [], computed_at: "" },
  },
  {
    id: "3",
    slug: "coconut-1",
    name: "Tender Coconut Water",
    brand: "Raw Pressery",
    category: "Beverages",
    subcategory: "Juices",
    l3_category: "Coconut Water",
    net_weight: "1 L",
    price_inr: 120,
    mrp_inr: 140,
    nutrition: { sugar_g_100g: 4, sodium_mg_100g: 50, energy_kcal_100g: 20 },
    ingredients_raw: "coconut water",
    attributes: null,
    core_scores: { score: 85, grade: "A", band: "excellent", subscores: { nutrition: 50, additives: 28, labels: 7 }, concerns: [], computed_at: "" },
  },
  {
    id: "4",
    slug: "biscuit-1",
    name: "McVitie's Digestive Biscuits",
    brand: "McVitie's",
    category: "Snacks",
    subcategory: "Biscuits & Cookies",
    l3_category: "Digestive Biscuits",
    net_weight: "200 g",
    price_inr: 80,
    mrp_inr: 90,
    nutrition: { protein_g_100g: 7, sugar_g_100g: 16, fat_g_100g: 18, fiber_g_100g: 3 },
    ingredients_raw: "wheat flour, sugar, palm oil, leavening",
    attributes: null,
    core_scores: { score: 48, grade: "D", band: "bad", subscores: { nutrition: 25, additives: 12, labels: 3 }, concerns: [], computed_at: "" },
  },
  {
    id: "5",
    slug: "milk-1",
    name: "Amul Taaza Milk",
    brand: "Amul",
    category: "Dairy",
    subcategory: "Milk",
    l3_category: "Toned Milk",
    net_weight: "1 L",
    price_inr: 60,
    mrp_inr: 60,
    nutrition: { protein_g_100g: 3.1, sugar_g_100g: 4.8, fat_g_100g: 3 },
    ingredients_raw: "toned milk",
    attributes: { "Diet Preference": "Vegetarian" },
    core_scores: { score: 70, grade: "B", band: "good", subscores: { nutrition: 40, additives: 25, labels: 5 }, concerns: [], computed_at: "" },
  },
];

let failed = 0;

for (const c of V2_INTENT_CASES) {
  const intent = parseSearchIntent(c.query);
  if (!c.check(intent)) {
    console.error(`[v2-intent] FAIL "${c.query}"`, intent);
    failed++;
  }
}

const index = finalizeIndexBatch(FIXTURES.map(enrichProductToIndexRow));
const profiles = buildCategoryTraitProfiles(index);

const smoothieIntent = parseSearchIntent("strawberry smoothie");
const smoothieCandidates = generateCandidates(index, smoothieIntent, profiles);
if (!smoothieCandidates.some((r) => r.name.toLowerCase().includes("strawberry"))) {
  console.error("[v2-candidates] FAIL strawberry smoothie should match strawberry product");
  failed++;
}

const runningIntent = parseSearchIntent("healthy drinks for running");
const runningCandidates = generateCandidates(index, runningIntent, profiles);
const runningRanked = rankCandidates(runningCandidates, runningIntent, undefined, 5);
if (runningRanked.length && !runningRanked.some((r) => r.row.name.toLowerCase().includes("coconut"))) {
  console.warn("[v2-goal] note: coconut water not top for running on tiny fixture set");
}

const coconut = index.find((r) => r.name.includes("Coconut"));
if (coconut) {
  const fit = computeGoalFit(coconut, { hydration: 0.35, electrolytes: 0.3, low_sugar: 0.2 });
  if (fit.score < 0.3) {
    console.error("[v2-goal-fit] FAIL coconut water should score for running traits");
    failed++;
  }
}

// Type filter must exclude biscuits from smoothie query
if (smoothieCandidates.some((r) => r.primary_type === "biscuit")) {
  console.error("[v2-leak] FAIL biscuit leaked into smoothie query");
  failed++;
}

if (failed === 0) {
  console.log(`[search:v2-regression] all checks passed (${V2_INTENT_CASES.length} intent cases)`);
} else {
  console.error(`[search:v2-regression] ${failed} failed`);
  process.exit(1);
}

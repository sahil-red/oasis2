/**
 * Search V2 regression — deterministic math + numeric extraction (no semantic rules).
 * Run: pnpm search:v2-regression
 */
import { extractNumericConstraints, requiresLlmIntent } from "@/lib/search/v2/numeric-constraints";
import { NUMERIC_CASES } from "@/lib/search/v2/v2-regression-cases";
import { computeGoalFit } from "@/lib/search/v2/goal-graph";
import { generateCandidates } from "@/lib/search/v2/candidate-generation";
import { buildCategoryTraitProfiles } from "@/lib/search/v2/category-profiles";
import { rankCandidates } from "@/lib/search/v2/ranking";
import { effectiveTraitScore } from "@/lib/search/v2/traits";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";

/** Fixture rows simulate L1 LLM enrichment output — not rule-inferred */
const FIXTURE_INDEX: ProductSearchIndexRow[] = [
  {
    product_id: "1",
    canonical_product_id: "1",
    slug: "smoothie-1",
    name: "True Elements Strawberry Smoothie Mix",
    brand: "True Elements",
    category: "Beverages",
    subcategory: "Smoothies",
    l3_category: "Smoothie Mix",
    primary_type: "smoothie",
    base_name: "strawberry smoothie mix",
    form: "powder",
    flavours: ["strawberry"],
    variants: [],
    is_veg: true,
    is_vegan: null,
    is_gluten_free: null,
    is_jain: null,
    is_palm_oil_free: null,
    has_added_sugar: null,
    allergens: [],
    claims: [],
    sugar_g: 12,
    protein_g: 8,
    fat_g: null,
    sodium_mg: null,
    energy_kcal: 380,
    price_inr: 199,
    sugar_tier: "medium",
    protein_tier: "high",
    fat_tier: "unknown",
    traits: { low_sugar: 0.6 },
    trait_source: { low_sugar: "math" },
    trait_confidence: { low_sugar: 0.8 },
    trait_reasons: {},
    scout_score: 72,
    nova_group: null,
    data_quality_score: 0.8,
    data_completeness: 0.8,
    facet_confidence: {},
    brand_tier: "regional",
    pack_size_value: 200,
    pack_size_unit: "g",
    use_cases: [],
    search_doc: "true elements strawberry smoothie mix smoothie",
    embedding: null,
    type_embedding: null,
    click_count: 0,
    save_count: 0,
    last_interaction_at: null,
    built_at: null,
    source_hash: null,
  },
  {
    product_id: "3",
    canonical_product_id: "3",
    slug: "coconut-1",
    name: "Tender Coconut Water",
    brand: "Raw Pressery",
    category: "Beverages",
    subcategory: "Juices",
    l3_category: "Coconut Water",
    primary_type: "coconut water",
    base_name: "coconut water",
    form: "liquid",
    flavours: [],
    variants: [],
    is_veg: true,
    is_vegan: true,
    is_gluten_free: true,
    is_jain: null,
    is_palm_oil_free: true,
    has_added_sugar: false,
    allergens: [],
    claims: [],
    sugar_g: 4,
    protein_g: 0.5,
    fat_g: 0,
    sodium_mg: 50,
    energy_kcal: 20,
    price_inr: 120,
    sugar_tier: "low",
    protein_tier: "low",
    fat_tier: "low",
    traits: { hydration: 0.9, electrolytes: 0.85, low_sugar: 0.8 },
    trait_source: { hydration: "llm", electrolytes: "llm", low_sugar: "math" },
    trait_confidence: { hydration: 0.9, electrolytes: 0.85, low_sugar: 0.8 },
    trait_reasons: {
      hydration: "Natural hydration from coconut water",
      electrolytes: "Contains natural electrolytes",
    },
    scout_score: 85,
    nova_group: null,
    data_quality_score: 0.85,
    data_completeness: 0.9,
    facet_confidence: {},
    brand_tier: "regional",
    pack_size_value: 1000,
    pack_size_unit: "ml",
    use_cases: ["running"],
    search_doc: "tender coconut water raw pressery",
    embedding: null,
    type_embedding: null,
    click_count: 0,
    save_count: 0,
    last_interaction_at: null,
    built_at: null,
    source_hash: null,
  },
];

let failed = 0;

for (const c of NUMERIC_CASES) {
  const n = extractNumericConstraints(c.query);
  if (!c.check(n)) {
    console.error(`[numeric] FAIL "${c.query}"`, n);
    failed++;
  }
}

if (!requiresLlmIntent("strawberry smoothie no added sugar")) {
  console.error("[gate] FAIL negation query should require LLM");
  failed++;
}
if (requiresLlmIntent("amul milk")) {
  console.error("[gate] FAIL simple brand+type should not force LLM gate");
  failed++;
}

const smoothieIntent: SearchIntentV2 = {
  kind: "directed",
  goal_phrase: null,
  goal_id: null,
  brand: null,
  primary_type: "smoothie",
  required_flavours: ["strawberry"],
  modifiers: [],
  constraints: { avoid_ingredients: [], allergens_excluded: [] },
  constraint_priorities: [],
  sort: "best_match",
  comparison_ref: null,
  comparison_mode: null,
  confidence: 0.9,
  intent_source: "fast-path",
  raw_query: "strawberry smoothie",
};

const profiles = await buildCategoryTraitProfiles(FIXTURE_INDEX);
const smoothieCandidates = await generateCandidates(FIXTURE_INDEX, smoothieIntent, profiles, null);
if (!smoothieCandidates.some((r) => r.name.toLowerCase().includes("strawberry"))) {
  console.error("[candidates] FAIL strawberry smoothie membership");
  failed++;
}

const coconut = FIXTURE_INDEX.find((r) => r.name.includes("Coconut"));
if (coconut) {
  const fit = computeGoalFit(coconut, { hydration: 0.35, electrolytes: 0.3, low_sugar: 0.2 });
  const h = effectiveTraitScore("hydration", coconut.traits.hydration, coconut);
  if (fit.score < 0.3 || h < 0.3) {
    console.error("[goal-fit] FAIL coconut running traits", fit, h);
    failed++;
  }
}

const relevance = new Map(FIXTURE_INDEX.map((r) => [r.product_id, 1]));
const ranked = rankCandidates(FIXTURE_INDEX, smoothieIntent, relevance, null, 5);
if (!ranked.length) {
  console.error("[rank] FAIL empty rank");
  failed++;
}

if (failed === 0) {
  console.log(`[search:v2-regression] all checks passed (${NUMERIC_CASES.length} numeric cases)`);
} else {
  console.error(`[search:v2-regression] ${failed} failed`);
  process.exit(1);
}

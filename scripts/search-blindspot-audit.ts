/**
 * Audit intent routing + catalog ILIKE term extraction for common prompt shapes.
 * Run: pnpm search:audit
 */
import { catalogSearchIlikeTerm } from "@/lib/search/catalog-query-text";
import {
  classifyIntent,
  hasConstraintLexicon,
  hasModifierLexicon,
} from "@/lib/search/intent-classify";
import { buildProductTypeSet } from "@/lib/search/catalog-intent-signals";
import { heuristicParseProductQuery } from "@/lib/search/query-parse";

const productTypes = buildProductTypeSet([
  "Noodles & Vermicelli",
  "Biscuits & Cookies",
  "Milk",
  "Soft Drinks",
  "Breakfast Cereals",
]);

type Case = {
  query: string;
  expectTier: "lexical" | "structured" | "complex";
  ilikeContains?: string;
  ilikeMustNot?: string;
  parseCheck?: (p: ReturnType<typeof heuristicParseProductQuery>) => boolean;
};

const CASES: Case[] = [
  { query: "oats", expectTier: "lexical", ilikeContains: "oats" },
  { query: "healthy noodles", expectTier: "structured", ilikeContains: "noodles" },
  { query: "healthy maggi", expectTier: "structured", ilikeContains: "maggi" },
  { query: "organic milk", expectTier: "structured", ilikeContains: "milk" },
  { query: "sugar free coke", expectTier: "structured", ilikeContains: "coke" },
  { query: "low sugar biscuits", expectTier: "structured", ilikeContains: "biscuit" },
  { query: "zero sugar soft drinks", expectTier: "structured" },
  { query: "gluten free bread", expectTier: "structured", ilikeContains: "bread" },
  { query: "chips without palm oil", expectTier: "structured", ilikeContains: "chip" },
  { query: "no preservatives juice", expectTier: "structured", ilikeContains: "juice" },
  { query: "keto friendly snacks", expectTier: "structured" },
  {
    query: "food for bulking",
    expectTier: "structured",
    parseCheck: (p) => p.health_contexts.includes("bulk"),
  },
  {
    query: "protein for parents",
    expectTier: "structured",
    parseCheck: (p) =>
      !p.product_terms.includes("parents") &&
      (p.hard_constraints.min_protein_g_100g ?? 0) >= 10,
  },
  { query: "high protein milk", expectTier: "structured", ilikeContains: "milk" },
  { query: "best paneer", expectTier: "structured", ilikeContains: "paneer" },
  { query: "clean protein bars", expectTier: "structured", ilikeContains: "bars" },
  {
    query: "something healthy for my kids tiffin with options",
    expectTier: "complex",
  },
];

let failed = 0;

for (const c of CASES) {
  const tier = classifyIntent(c.query, { productTypes });
  if (tier !== c.expectTier) {
    console.error(`[intent] FAIL "${c.query}" → ${tier} (want ${c.expectTier})`);
    failed++;
  }

  const ilike = catalogSearchIlikeTerm(c.query);
  if (c.ilikeContains && (!ilike || !ilike.includes(c.ilikeContains))) {
    console.error(`[ilike] FAIL "${c.query}" → ${ilike} (want contains ${c.ilikeContains})`);
    failed++;
  }
  if (c.ilikeMustNot && ilike?.includes(c.ilikeMustNot)) {
    console.error(`[ilike] FAIL "${c.query}" → ${ilike} (must not contain ${c.ilikeMustNot})`);
    failed++;
  }

  if (c.parseCheck) {
    const parsed = heuristicParseProductQuery(c.query);
    if (!c.parseCheck(parsed)) {
      console.error(`[parse] FAIL "${c.query}"`, JSON.stringify(parsed).slice(0, 120));
      failed++;
    }
  }
}

// Phrase traps: full query must not be required in ILIKE
for (const q of ["healthy noodles", "low sugar biscuits", "organic milk"]) {
  const ilike = catalogSearchIlikeTerm(q);
  if (ilike === q.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()) {
    console.error(`[ilike] FAIL phrase trap: "${q}" → full phrase "${ilike}"`);
    failed++;
  }
}

console.log(
  `\nAudit: ${CASES.length} cases, organic milk signals: constraint=${hasConstraintLexicon("organic milk")} modifier=${hasModifierLexicon("organic milk")}`,
);
if (failed) {
  console.error(`\n${failed} blindspot(s) found`);
  process.exit(1);
}
console.log("All search blindspot audit checks passed.");

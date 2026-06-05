/**
 * Lightweight regression checks for search routing + heuristic parse (no DB).
 * Run: pnpm search:regression
 */
import { classifyIntent } from "@/lib/search/intent-classify";
import { buildProductTypeSet } from "@/lib/search/catalog-intent-signals";
import { heuristicParseProductQuery } from "@/lib/search/query-parse";
import { isFalsePositiveProductLabel } from "@/lib/search/product-term-heuristics";
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

if (failed > 0) {
  console.error(`\n${failed} regression check(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${INTENT_CASES.length + PARSE_CASES.length + 2} search regression checks passed.`);

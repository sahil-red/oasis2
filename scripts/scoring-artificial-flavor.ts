/**
 * Regression: artificial_flavors sublabel uses LLM concern_reasons + label text, not role=flavor alone.
 * Run: pnpm scoring:artificial-flavor
 */
import { hasArtificialFlavorsFromIntelligence } from "@/lib/scoring/artificial-flavor";
import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";

function row(
  partial: Partial<IngredientIntelligenceRow> & Pick<IngredientIntelligenceRow, "normalized_name">,
): IngredientIntelligenceRow {
  return {
    display_name: null,
    nova_class: 3,
    role: "other",
    concern_tier: "watchful",
    concern_reasons: [],
    intrinsic_quality: 50,
    synonyms: [],
    ...partial,
  };
}

let failed = 0;

function expect(label: string, got: boolean, want: boolean) {
  if (got !== want) {
    console.error(`[artificial] FAIL ${label}: got ${got}, want ${want}`);
    failed++;
  }
}

const masalaIng =
  "Water, Curd (Milk, DVS [Active Culture]), Common Salt, Black Pepper & Masala";
const masalaRows: IngredientIntelligenceRow[] = [
  row({ normalized_name: "cumin", role: "flavor", concern_reasons: ["Spice aroma"] }),
  row({ normalized_name: "black pepper", role: "flavor" }),
  row({ normalized_name: "ginger", role: "flavor" }),
];

expect(
  "masala chaas (spices as role=flavor)",
  hasArtificialFlavorsFromIntelligence(masalaIng, masalaRows),
  false,
);

expect(
  "label declares artificial flavouring",
  hasArtificialFlavorsFromIntelligence("Sugar, Artificial flavouring substances", []),
  true,
);

expect(
  "LLM concern_reasons flag artificial additive",
  hasArtificialFlavorsFromIntelligence("Permitted flavour", [
    row({
      normalized_name: "artificial flavouring substances",
      role: "flavor",
      concern_reasons: ["Artificial flavoring additive"],
    }),
  ]),
  true,
);

expect(
  "natural flavouring only",
  hasArtificialFlavorsFromIntelligence("Milk, Natural flavouring substances", [
    row({
      normalized_name: "natural flavouring substances",
      role: "flavor",
      concern_reasons: ["Natural flavour additive"],
    }),
  ]),
  false,
);

if (failed > 0) {
  console.error(`\n${failed} artificial-flavor check(s) failed`);
  process.exit(1);
}

console.log("All artificial-flavor regression checks passed.");

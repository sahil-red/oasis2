import type { NumericExtraction } from "@/lib/search/v2/numeric-constraints";

/** Allowed deterministic extraction tests — §0.2 */
export const NUMERIC_CASES: Array<{
  query: string;
  check: (n: NumericExtraction) => boolean;
}> = [
  {
    query: "biscuits under ₹100",
    check: (n) => n.max_price === 100 && n.residual_text.includes("biscuit"),
  },
  {
    query: "high protein milk",
    check: (n) => n.high_protein_tier && n.sort === "highest_protein",
  },
  {
    // Soft ask ⇒ ranking modifier ONLY. A hard cutoff here was the old
    // mislabeling bug class — this case now guards against its return.
    query: "low sugar biscuits",
    check: (n) => n.low_sugar_tier && n.max_sugar_g == null,
  },
  {
    query: "zero sugar drinks",
    check: (n) => n.max_sugar_g === 1 && n.no_added_sugar,
  },
  {
    query: "healthier than maggi",
    check: (n) =>
      n.comparison_ref === "maggi" &&
      n.comparison_mode === "healthier_than" &&
      n.sort === "healthiest",
  },
  {
    query: "cheaper than amul butter",
    check: (n) => n.comparison_ref === "amul butter" && n.comparison_mode === "cheaper_than",
  },
  {
    query: "biscuits under 5g sugar",
    check: (n) => n.max_sugar_g === 5 && n.residual_text.includes("biscuit"),
  },
  {
    query: "protein shake under 100 calories",
    check: (n) => n.max_calories === 100 && n.residual_text.includes("protein shake"),
  },
  {
    query: "snacks below 150 kcal",
    check: (n) => n.max_calories === 150 && n.residual_text.includes("snack"),
  },
];

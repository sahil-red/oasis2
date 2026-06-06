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
    query: "low sugar biscuits",
    check: (n) => n.low_sugar_tier && n.max_sugar_g === 10,
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
];

import type { SearchIntentV2 } from "@/lib/search/v2/types";

export const V2_INTENT_CASES: Array<{
  query: string;
  check: (intent: SearchIntentV2) => boolean;
}> = [
  {
    query: "strawberry smoothie",
    check: (i) => i.primary_type === "smoothie" && i.required_flavours.includes("strawberry"),
  },
  {
    query: "healthy drinks for running",
    check: (i) => i.kind === "goal" && i.goal_id === "running",
  },
  {
    query: "amul",
    check: (i) => i.kind === "brand",
  },
  {
    query: "high protein milk",
    check: (i) => i.primary_type === "milk" && i.sort === "highest_protein",
  },
  {
    query: "peanut butter no palm oil",
    check: (i) =>
      i.primary_type === "peanut butter" && i.constraints.avoid_ingredients.some((a) => a.includes("palm")),
  },
  {
    query: "doodh",
    check: (i) => i.primary_type === "milk",
  },
  {
    query: "biscuits for diabetics",
    check: (i) => i.primary_type === "biscuit",
  },
];

/**
 * Nutrition goals. Diet preferences (vegetarian / vegan) are a separate
 * cross-cutting filter (see `lib/diet/types.ts`), not a goal.
 */
export type GoalId =
  | "balanced"
  | "gym"
  | "bulk"
  | "diabetic"
  | "fat-loss"
  | "pcos"
  | "protein-budget"
  | "kids";

export type GoalProfile = {
  id: GoalId;
  label: string;
  short: string;
  description: string;
};

export const GOAL_PROFILES: GoalProfile[] = [
  {
    id: "balanced",
    label: "Balanced",
    short: "Balanced",
    description: "Standard Core score — nutrition, additives, and labels.",
  },
  {
    id: "gym",
    label: "Gym",
    short: "Gym",
    description: "More protein per 100g, without crazy sugar.",
  },
  {
    id: "bulk",
    label: "Bulk",
    short: "Bulk",
    description: "Calorie-dense picks with solid protein for gaining weight.",
  },
  {
    id: "diabetic",
    label: "Diabetic-friendly",
    short: "Diabetic",
    description: "Penalises sugar and refined carbs; rewards fibre.",
  },
  {
    id: "fat-loss",
    label: "Fat loss",
    short: "Fat loss",
    description: "Lower energy density, higher protein and fibre.",
  },
  {
    id: "pcos",
    label: "PCOS",
    short: "PCOS",
    description: "Low added sugar, moderate carbs, minimal ultra-processed signals.",
  },
  {
    id: "protein-budget",
    label: "Protein / ₹",
    short: "Protein/₹",
    description: "Maximises grams of protein per rupee in the catalog.",
  },
  {
    id: "kids",
    label: "Kids",
    short: "Kids",
    description: "Heavily penalises flagged additives and artificial colours.",
  },
];

export function goalFromParam(raw: string | null | undefined): GoalId {
  const id = (raw ?? "balanced").toLowerCase() as GoalId;
  return GOAL_PROFILES.some((g) => g.id === id) ? id : "balanced";
}

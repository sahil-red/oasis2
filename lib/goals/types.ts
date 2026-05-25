export type GoalId =
  | "balanced"
  | "gym"
  | "bulk"
  | "diabetic"
  | "fat-loss"
  | "pcos"
  | "vegan"
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
    short: "Default",
    description: "Standard Core score — nutrition, additives, and labels.",
  },
  {
    id: "gym",
    label: "Gym",
    short: "High protein",
    description: "More protein per 100g, without crazy sugar.",
  },
  {
    id: "bulk",
    label: "Bulk",
    short: "Weight gain",
    description: "Calorie-dense picks with solid protein for gaining weight.",
  },
  {
    id: "diabetic",
    label: "Diabetic-friendly",
    short: "Low sugar",
    description: "Penalises sugar and refined carbs; rewards fibre.",
  },
  {
    id: "fat-loss",
    label: "Fat loss",
    short: "Lean picks",
    description: "Lower energy density, higher protein and fibre.",
  },
  {
    id: "pcos",
    label: "PCOS mode",
    short: "Stable glucose",
    description: "Low added sugar, moderate carbs, minimal ultra-processed signals.",
  },
  {
    id: "vegan",
    label: "Vegan",
    short: "Plant-based",
    description: "Flags common animal-derived ingredients on Indian labels.",
  },
  {
    id: "protein-budget",
    label: "Protein / ₹",
    short: "Budget gains",
    description: "Maximises grams of protein per rupee on Blinkit.",
  },
  {
    id: "kids",
    label: "Kids — clean",
    short: "Fewer additives",
    description: "Heavily penalises flagged additives and artificial colours.",
  },
];

export function goalFromParam(raw: string | null | undefined): GoalId {
  const id = (raw ?? "balanced").toLowerCase() as GoalId;
  return GOAL_PROFILES.some((g) => g.id === id) ? id : "balanced";
}

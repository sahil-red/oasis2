export type DietMode = "any" | "veg" | "veg-eggs" | "vegan";

export interface DietProfile {
  id: DietMode;
  label: string;
  short: string;
  description: string;
}

export const DIET_PROFILES: DietProfile[] = [
  {
    id: "any",
    label: "Any diet",
    short: "Any",
    description: "Show every product — no diet filter.",
  },
  {
    id: "veg",
    label: "Vegetarian",
    short: "Veg",
    description: "Hide meat, fish, and egg products. Dairy is fine.",
  },
  {
    id: "veg-eggs",
    label: "Veg + eggs",
    short: "Veg + eggs",
    description: "Lacto-ovo: dairy and eggs are fine, meat and fish are not.",
  },
  {
    id: "vegan",
    label: "Vegan",
    short: "Vegan",
    description: "Hide all animal-derived ingredients (dairy, eggs, honey, whey).",
  },
];

const VALID = new Set<DietMode>(DIET_PROFILES.map((d) => d.id));

export function dietFromParam(raw: string | null | undefined): DietMode {
  if (!raw) return "any";
  const id = raw.toLowerCase() as DietMode;
  return VALID.has(id) ? id : "any";
}

export function dietLabelFor(id: DietMode): string {
  return DIET_PROFILES.find((d) => d.id === id)?.label ?? "Any diet";
}

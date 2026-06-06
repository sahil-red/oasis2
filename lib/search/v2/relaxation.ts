import type { SearchIntentV2 } from "@/lib/search/v2/types";

export type RelaxationStep = {
  label: string;
  apply: (intent: SearchIntentV2) => SearchIntentV2;
  relaxesDataQuality?: boolean;
};

/**
 * §11 Query relaxation — stepwise, always explained.
 * Never relax primary_type or required_flavour.
 */
export const RELAXATION_LADDER: RelaxationStep[] = [
  {
    label: "Dropped preferred modifiers",
    apply: (intent) => ({ ...intent, modifiers: [] }),
  },
  {
    label: "Relaxed sugar threshold by one tier",
    apply: (intent) => ({
      ...intent,
      constraints: {
        ...intent.constraints,
        max_sugar_g:
          intent.constraints.max_sugar_g != null ? intent.constraints.max_sugar_g * 1.5 : undefined,
      },
    }),
  },
  {
    label: "Relaxed price limit",
    apply: (intent) => ({
      ...intent,
      constraints: { ...intent.constraints, max_price: undefined },
    }),
  },
  {
    label: "Dropped avoid-ingredient filters that cannot be verified on every label",
    apply: (intent) => ({
      ...intent,
      constraints: { ...intent.constraints, avoid_ingredients: [] },
    }),
  },
  {
    label: "Included products with partially verified label data",
    relaxesDataQuality: true,
    apply: (intent) => intent,
  },
];

export function cloneIntent(intent: SearchIntentV2): SearchIntentV2 {
  return {
    ...intent,
    required_flavours: [...intent.required_flavours],
    modifiers: [...intent.modifiers],
    constraints: {
      ...intent.constraints,
      avoid_ingredients: [...intent.constraints.avoid_ingredients],
      allergens_excluded: [...intent.constraints.allergens_excluded],
    },
  };
}

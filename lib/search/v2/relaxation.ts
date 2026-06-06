/**
 * §11 relaxation — deterministic constraint dropping first; LLM optional when Groq is configured.
 */
import type { SearchIntentV2 } from "@/lib/search/v2/types";

export { relaxIntentWithLlm } from "@/lib/search/v2/llm-intent";

/** Drop the lowest-priority constraint or modifier without any LLM call (§9 degradation). */
export function relaxIntentDeterministic(
  intent: SearchIntentV2,
): { intent: SearchIntentV2; explanation: string } | null {
  const priorities = [...intent.constraint_priorities].sort((a, b) => a.priority - b.priority);
  const field = priorities[0]?.field;

  if (field) {
    const constraints = { ...intent.constraints };
    let explanation = `Relaxed ${field.replace(/_/g, " ")}`;

    switch (field) {
      case "max_price":
        delete constraints.max_price;
        break;
      case "max_sugar_g":
        delete constraints.max_sugar_g;
        break;
      case "max_fat_g":
        delete constraints.max_fat_g;
        break;
      case "min_protein_g":
        delete constraints.min_protein_g;
        break;
      case "vegan":
        delete constraints.vegan;
        break;
      case "vegetarian":
        delete constraints.vegetarian;
        break;
      case "gluten_free":
        delete constraints.gluten_free;
        break;
      case "palm_oil_free":
        delete constraints.palm_oil_free;
        break;
      case "avoid_ingredients":
        constraints.avoid_ingredients = [];
        explanation = "Relaxed ingredient avoid list";
        break;
      case "allergens_excluded":
        constraints.allergens_excluded = [];
        explanation = "Relaxed allergen exclusions";
        break;
      default:
        return null;
    }

    return {
      intent: {
        ...intent,
        constraints,
        constraint_priorities: priorities.slice(1),
      },
      explanation,
    };
  }

  if (intent.modifiers.length) {
    const modifiers = intent.modifiers.slice(0, -1);
    const dropped = intent.modifiers[intent.modifiers.length - 1]!;
    return {
      intent: { ...intent, modifiers },
      explanation: `Relaxed "${dropped.replace(/_/g, " ")}"`,
    };
  }

  return null;
}

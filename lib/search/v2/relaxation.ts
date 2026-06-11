/**
 * §11 relaxation — deterministic constraint dropping first; LLM optional when Groq is configured.
 */
import type { SearchIntentV2 } from "@/lib/search/v2/types";

export { relaxIntentWithLlm } from "@/lib/search/v2/llm-intent";

/** Constraints that are never auto-relaxed: dropping an allergen exclusion or a
 *  dietary identity behind the user's back is a safety failure, not a UX nicety.
 *  Zero results with the constraint intact beats results that violate it. */
const NON_RELAXABLE_FIELDS = new Set([
  "vegan",
  "vegetarian",
  "gluten_free",
  "palm_oil_free",
  "avoid_ingredients",
  "allergens_excluded",
]);

/** Drop the lowest-priority constraint or modifier without any LLM call (§9 degradation). */
export function relaxIntentDeterministic(
  intent: SearchIntentV2,
): { intent: SearchIntentV2; explanation: string } | null {
  const priorities = [...intent.constraint_priorities]
    .filter((p) => !NON_RELAXABLE_FIELDS.has(p.field))
    .sort((a, b) => a.priority - b.priority);
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

  // Flavour is an explicit ask but not a safety constraint — relax it with an
  // honest message instead of serving non-matching products as if they matched.
  if (intent.required_flavours.length) {
    const flavours = intent.required_flavours.join(", ");
    return {
      intent: { ...intent, required_flavours: [] },
      explanation: `No exact ${flavours} match — showing the closest options`,
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

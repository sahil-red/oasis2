/**
 * Cross-validate LLM enrichment output against deterministic ingredient data.
 *
 * The LLM enrichment pipeline classifies products with dietary booleans (is_vegan,
 * is_gluten_free, has_added_sugar, etc.) and semantic traits (clean_label, whole_food,
 * processing_level). The LLM works from product name + ingredient text without a
 * known-ingredient dictionary, so it can misclassify:
 *
 *   - "plant-based" products that actually contain whey/casein/egg
 *   - "gluten-free" claims on products containing wheat/maida
 *   - "no added sugar" on products containing jaggery/honey
 *   - High clean_label on products loaded with E-numbers
 *
 * This module cross-checks the LLM output against the KNOWN_INGREDIENTS dictionary
 * and corrects contradictions. Called during index build, right after LLM enrichment.
 */

import type { LlmProductEnrichment } from "@/lib/search/v2/llm-enrichment";

const ANIMAL_INGREDIENTS = /(?:^|,)\s*.*\b(?:milk|whey|casein|skimmed milk|cream|butter|ghee|paneer|egg|honey|gelatin|lactose)\b/i;
const GLUTEN_INGREDIENTS = /(?:^|,)\s*.*\b(?:wheat|barley|rye|maida|sooji|rava|atta|pasta|noodle|bread|biscuit|cookie|cracker|rusk)\b/i;
const ADDED_SUGAR_INGREDIENTS = /(?:^|,)\s*.*\b(?:sugar|cane sugar|brown sugar|jaggery|honey|maple syrup|glucose syrup|high fructose|corn syrup|golden syrup|molasses|date syrup|coconut sugar|invert sugar|maltose|dextrose|fructose)\b/i;
const PALM_INGREDIENTS = /(?:^|,)\s*.*\bpalm\b/i;
const E_NUMBER_COUNT = /\b(?:e|ins)\s*\d{3,4}[a-z]?\b/gi;

/** Cross-validate LLM enrichment against the product's ingredient text.
 *  Returns a corrected copy of the enrichment object. */
export function validateEnrichment(
  enrichment: LlmProductEnrichment,
  ingredientsRaw: string | null | undefined,
): LlmProductEnrichment {
  if (!ingredientsRaw?.trim()) return enrichment;

  const ing = ingredientsRaw.toLowerCase();
  const result = { ...enrichment };

  // ── Dietary boolean cross-checks ──

  // is_vegan: false if animal ingredients present (not just cross-contact)
  if (result.is_vegan && ANIMAL_INGREDIENTS.test(ing)) {
    result.is_vegan = false;
  }

  // is_gluten_free: false if gluten grains present AND no explicit "gluten free" claim
  if (result.is_gluten_free && GLUTEN_INGREDIENTS.test(ing) && !/\bgluten\s*free\b/i.test(ing)) {
    result.is_gluten_free = false;
  }

  // has_added_sugar: true if added sugars appear in ingredients
  if (!result.has_added_sugar && ADDED_SUGAR_INGREDIENTS.test(ing)) {
    result.has_added_sugar = true;
  }

  // is_palm_oil_free: false if palm oil explicitly in ingredients
  if (result.is_palm_oil_free && PALM_INGREDIENTS.test(ing)) {
    result.is_palm_oil_free = false;
  }

  // ── Semantic trait caps (LLM traits clamped by deterministic signal) ──

  const eNumberCount = (ing.match(E_NUMBER_COUNT) || []).length;

  if (result.semantic_traits) {
    // clean_label: cap at 0.5 when ≥5 E-numbers detected
    if (eNumberCount >= 5 && result.semantic_traits.clean_label) {
      result.semantic_traits = {
        ...result.semantic_traits,
        clean_label: { ...result.semantic_traits.clean_label, value: Math.min(result.semantic_traits.clean_label.value, 0.5) },
      };
    }

    // whole_food: cap at 0.6 when ≥3 E-numbers detected
    if (eNumberCount >= 3 && result.semantic_traits.whole_food) {
      result.semantic_traits = {
        ...result.semantic_traits,
        whole_food: { ...result.semantic_traits.whole_food, value: Math.min(result.semantic_traits.whole_food.value, 0.6) },
      };
    }
  }

  return result;
}

import { loadIngredientIntelligenceForProduct } from "@/lib/scoring/ingredient-lookup";
import { adminClient } from "@/lib/supabase/admin";
import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";

/** Server-only: cached intelligence rows for a product ingredients list. */
export async function loadIngredientIntelligenceForDisplay(
  ingredients_raw: string | null,
): Promise<IngredientIntelligenceRow[]> {
  if (!ingredients_raw?.trim()) return [];
  try {
    return await loadIngredientIntelligenceForProduct(
      adminClient(),
      ingredients_raw,
    );
  } catch {
    return [];
  }
}

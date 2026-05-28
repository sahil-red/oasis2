import { splitIngredientSegments } from "@/lib/ocr/format-ingredients";
import { expandAndNormalize } from "@/lib/scoring/ingredient-normalize";

/** Canonical key for ingredient_intelligence table. */
export function normalizeIngredientName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[""]/g, '"')
    .trim();
}

/** Unique atomic ingredients from a product list (split → expand compounds → normalize). */
export function uniqueIngredientsFromList(ingredients_raw: string | null): string[] {
  if (!ingredients_raw?.trim()) return [];
  const segments = splitIngredientSegments(ingredients_raw);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of segments) {
    for (const atom of expandAndNormalize(seg)) {
      const key = normalizeIngredientName(atom);
      if (key.length < 3 || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

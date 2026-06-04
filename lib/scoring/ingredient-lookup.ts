import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";
import { expandAndNormalize } from "@/lib/scoring/ingredient-normalize";
import {
  insCodesFromText,
  lookupKeysForInsCode,
  resolveIngredientIntelligenceRow,
} from "@/lib/scoring/intelligence-row-resolve";
import { uniqueIngredientsFromList } from "@/lib/scoring/normalize-ingredient-name";

function collectLookupKeys(names: string[]): string[] {
  const keys = new Set(names);
  for (const name of names) {
    for (const code of insCodesFromText(name)) {
      for (const key of lookupKeysForInsCode(code)) keys.add(key);
    }
    for (const atom of expandAndNormalize(name)) {
      keys.add(atom);
      for (const code of insCodesFromText(atom)) {
        for (const key of lookupKeysForInsCode(code)) keys.add(key);
      }
    }
  }
  return [...keys];
}

/** Load cached intelligence rows for a product ingredients list (order preserved). */
export async function loadIngredientIntelligenceForProduct(
  supabase: SupabaseClient,
  ingredients_raw: string | null,
): Promise<IngredientIntelligenceRow[]> {
  const names = uniqueIngredientsFromList(ingredients_raw);
  if (!names.length) return [];

  const lookupKeys = collectLookupKeys(names);
  const { data, error } = await supabase
    .from("ingredient_intelligence")
    .select(
      "normalized_name, display_name, nova_class, role, concern_tier, concern_reasons, intrinsic_quality, synonyms",
    )
    .in("normalized_name", lookupKeys);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw error;
  }

  const byName = new Map(
    (data ?? []).map((row) => [
      row.normalized_name as string,
      {
        normalized_name: row.normalized_name as string,
        display_name: (row.display_name as string | null) ?? null,
        nova_class: Number(row.nova_class ?? 3),
        role: (row.role as IngredientIntelligenceRow["role"]) ?? "other",
        concern_tier:
          (row.concern_tier as IngredientIntelligenceRow["concern_tier"]) ??
          "watchful",
        concern_reasons: (row.concern_reasons as string[]) ?? [],
        intrinsic_quality: Number(row.intrinsic_quality ?? 50),
        synonyms: (row.synonyms as string[]) ?? [],
      } satisfies IngredientIntelligenceRow,
    ]),
  );

  return names
    .map((n) => resolveIngredientIntelligenceRow(n, byName, expandAndNormalize))
    .filter((r): r is IngredientIntelligenceRow => r != null);
}

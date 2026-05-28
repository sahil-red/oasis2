import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAbsoluteScore } from "@/lib/scoring/absolute";
import { computeCoreScoreV9 } from "@/lib/scoring/core-v9";
import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";
import { loadIngredientIntelligenceForProduct } from "@/lib/scoring/ingredient-lookup";
import { uniqueIngredientsFromList } from "@/lib/scoring/normalize-ingredient-name";
import { buildCohortId } from "@/lib/scoring/relative";
import type { ScoreableProduct } from "@/lib/scoring/persist-core";
import type { ProductNutrition } from "@/lib/supabase/types";

export type V9Preload = {
  ingredientByProduct: Map<string, IngredientIntelligenceRow[]>;
  cohortAbsolutes: Map<string, number[]>;
};

/** Load all ingredient_intelligence rows into a name → row map. */
export async function loadAllIngredientIntelligence(
  supabase: SupabaseClient,
): Promise<Map<string, IngredientIntelligenceRow>> {
  const map = new Map<string, IngredientIntelligenceRow>();
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("ingredient_intelligence")
      .select(
        "normalized_name, display_name, nova_class, role, concern_tier, concern_reasons, intrinsic_quality, synonyms",
      )
      .range(offset, offset + pageSize - 1);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return map;
      throw error;
    }
    if (!data?.length) break;
    for (const row of data) {
      map.set(row.normalized_name as string, {
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
      });
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return map;
}

export function ingredientRowsForProduct(
  ingredients_raw: string | null,
  globalMap: Map<string, IngredientIntelligenceRow>,
): IngredientIntelligenceRow[] {
  if (!ingredients_raw?.trim() || !globalMap.size) return [];
  return rowsFromGlobalMap(ingredients_raw, globalMap);
}

function rowsFromGlobalMap(
  ingredients_raw: string,
  globalMap: Map<string, IngredientIntelligenceRow>,
): IngredientIntelligenceRow[] {
  const names = uniqueIngredientsFromList(ingredients_raw);
  return names
    .map((n) => globalMap.get(n))
    .filter((r): r is IngredientIntelligenceRow => r != null);
}

/** Prefer async DB lookup per product when global cache is empty. */
export async function preloadV9ForProducts(
  supabase: SupabaseClient,
  rows: ScoreableProduct[],
): Promise<V9Preload> {
  const globalIng = await loadAllIngredientIntelligence(supabase);
  const ingredientByProduct = new Map<string, IngredientIntelligenceRow[]>();

  const absolutesByCohort = new Map<string, number[]>();

  for (const row of rows) {
    let ingRows = ingredientRowsForProduct(row.ingredients_raw, globalIng);
    if (!ingRows.length && row.ingredients_raw?.trim()) {
      ingRows = await loadIngredientIntelligenceForProduct(
        supabase,
        row.ingredients_raw,
      );
    }
    ingredientByProduct.set(row.id, ingRows);

    const abs = computeAbsoluteScore({
      ingredients_raw: row.ingredients_raw,
      nutrition: row.nutrition as ProductNutrition | null,
      category: row.category,
      subcategory: row.subcategory,
      product_name: row.name,
      attributes: row.attributes,
      ingredientRows: ingRows,
    });

    const cohortId = buildCohortId(
      row.category,
      row.subcategory,
      abs.role_cohort,
    );
    const list = absolutesByCohort.get(cohortId) ?? [];
    list.push(abs.absolute);
    absolutesByCohort.set(cohortId, list);
  }

  return { ingredientByProduct, cohortAbsolutes: absolutesByCohort };
}

export function computeCoreScoreV9ForRow(
  row: ScoreableProduct,
  preload: V9Preload,
) {
  const ingRows = preload.ingredientByProduct.get(row.id) ?? [];
  const abs = computeAbsoluteScore({
    ingredients_raw: row.ingredients_raw,
    nutrition: row.nutrition as ProductNutrition | null,
    category: row.category,
    subcategory: row.subcategory,
    product_name: row.name,
    attributes: row.attributes,
    ingredientRows: ingRows,
  });
  const cohortId = buildCohortId(
    row.category,
    row.subcategory,
    abs.role_cohort,
  );
  const cohortList = preload.cohortAbsolutes.get(cohortId) ?? [];

  return computeCoreScoreV9({
    ingredients_raw: row.ingredients_raw,
    nutrition: row.nutrition as ProductNutrition | null,
    category: row.category,
    subcategory: row.subcategory,
    product_name: row.name,
    attributes: row.attributes,
    ingredientRows: ingRows,
    cohortAbsolutes: cohortList,
  });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { countNutritionFields } from "@/lib/nutrition/completeness";
import { nutritionHasCriticalAnomalies } from "@/lib/nutrition/anomaly";
import { computeCoreScore, type CoreScoreResult } from "@/lib/scoring/core";
import type { ProductNutrition } from "@/lib/supabase/types";

export const SCORING_RULE_VERSION = Number(process.env.SCORING_RULE_VERSION ?? 8);

export type ScoreableProduct = {
  id: string;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  attributes: Record<string, string> | null;
};

type CoreScoreUpsert = {
  product_id: string;
  score: number;
  grade: CoreScoreResult["grade"];
  band: CoreScoreResult["band"];
  subscores: CoreScoreResult["subscores"];
  concerns: CoreScoreResult["concerns"];
  breakdown: CoreScoreResult["breakdown"];
  rule_version: number;
  computed_at: string;
};

export function hasScoreableNutrition(
  nutrition: ProductNutrition | Record<string, unknown> | null,
): boolean {
  if (!nutrition || typeof nutrition !== "object") return false;
  // Single stray field (e.g. only bogus protein) must not drive a score.
  if (countNutritionFields(nutrition) < 2) return false;
  return true;
}

export function buildCoreScoreUpsert(row: ScoreableProduct): CoreScoreUpsert | null {
  if (!hasScoreableNutrition(row.nutrition)) return null;

  if (
    row.nutrition &&
    nutritionHasCriticalAnomalies(row.nutrition, {
      name: row.name ?? "",
      category: row.category,
      subcategory: row.subcategory,
    })
  ) {
    return null;
  }

  const result = computeCoreScore({
    ingredients_raw: row.ingredients_raw,
    nutrition: row.nutrition,
    category: row.category,
    subcategory: row.subcategory,
    product_name: row.name,
    attributes: row.attributes,
  });

  return {
    product_id: row.id,
    score: result.score,
    grade: result.grade,
    band: result.band,
    subscores: result.subscores,
    concerns: result.concerns,
    breakdown: result.breakdown,
    rule_version: SCORING_RULE_VERSION,
    computed_at: new Date().toISOString(),
  };
}

const UPSERT_BATCH = 100;

export async function persistCoreScoresBatch(
  supabase: SupabaseClient,
  rows: ScoreableProduct[],
  opts: { dryRun?: boolean } = {},
): Promise<{ scored: number; no_nutrition: number }> {
  const payloads: CoreScoreUpsert[] = [];
  for (const row of rows) {
    const payload = buildCoreScoreUpsert(row);
    if (payload) payloads.push(payload);
  }

  if (opts.dryRun) {
    return { scored: payloads.length, no_nutrition: rows.length - payloads.length };
  }

  let scored = 0;
  for (let i = 0; i < payloads.length; i += UPSERT_BATCH) {
    const chunk = payloads.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase.from("core_scores").upsert(chunk);
    if (error) {
      console.warn(`[persist-core] batch upsert @${i}:`, error.message);
      continue;
    }
    scored += chunk.length;
  }

  return { scored, no_nutrition: rows.length - payloads.length };
}

export async function persistCoreScore(
  supabase: SupabaseClient,
  row: ScoreableProduct,
  opts: { force?: boolean; dryRun?: boolean } = {},
): Promise<"scored" | "skipped" | "no_nutrition"> {
  if (!hasScoreableNutrition(row.nutrition)) return "no_nutrition";

  if (
    row.nutrition &&
    nutritionHasCriticalAnomalies(row.nutrition, {
      name: row.name ?? "",
      category: row.category,
      subcategory: row.subcategory,
    })
  ) {
    return "no_nutrition";
  }

  if (!opts.force) {
    const { data: existing } = await supabase
      .from("core_scores")
      .select("product_id, rule_version")
      .eq("product_id", row.id)
      .maybeSingle();
    if (existing && existing.rule_version === SCORING_RULE_VERSION) {
      return "skipped";
    }
  }

  const payload = buildCoreScoreUpsert(row);
  if (!payload) return "no_nutrition";
  if (opts.dryRun) return "scored";

  const { error } = await supabase.from("core_scores").upsert(payload);
  if (error) {
    console.warn(`[persist-core] upsert ${row.id}:`, error.message);
    return "skipped";
  }
  return "scored";
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { nutritionHasCriticalAnomalies } from "@/lib/nutrition/anomaly";
import { computeCoreScore } from "@/lib/scoring/core";
import type { ProductNutrition } from "@/lib/supabase/types";

export const SCORING_RULE_VERSION = Number(process.env.SCORING_RULE_VERSION ?? 7);

export type ScoreableProduct = {
  id: string;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  attributes: Record<string, string> | null;
};

export function hasScoreableNutrition(
  nutrition: ProductNutrition | Record<string, unknown> | null,
): boolean {
  if (!nutrition || typeof nutrition !== "object") return false;
  const META = new Set(["source", "extra"]);
  for (const [k, v] of Object.entries(nutrition)) {
    if (META.has(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) return true;
  }
  return false;
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

  const result = computeCoreScore({
    ingredients_raw: row.ingredients_raw,
    nutrition: row.nutrition,
    category: row.category,
    subcategory: row.subcategory,
    product_name: row.name,
    attributes: row.attributes,
  });

  if (opts.dryRun) return "scored";

  const { error } = await supabase.from("core_scores").upsert({
    product_id: row.id,
    score: result.score,
    grade: result.grade,
    band: result.band,
    subscores: result.subscores,
    concerns: result.concerns,
    breakdown: result.breakdown,
    rule_version: SCORING_RULE_VERSION,
    computed_at: new Date().toISOString(),
  });

  if (error) {
    console.warn(`[persist-core] upsert ${row.id}:`, error.message);
    return "skipped";
  }
  return "scored";
}

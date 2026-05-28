import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";
import { computeAbsoluteScore, type AbsoluteScoreResult } from "@/lib/scoring/absolute";
import { buildCohortId, computeRelativeScore } from "@/lib/scoring/relative";
import {
  pickVerdictSublabels,
  sublabelsToDisplay,
  type SublabelId,
} from "@/lib/scoring/sublabels";
import { determineVerdict, type VerdictId } from "@/lib/scoring/verdict";
import type { MatchedAdditive } from "@/lib/scoring/rules";
import type { ProductNutrition } from "@/lib/supabase/types";
import {
  bandFromScore,
  gradeFromScore,
  type Grade,
  type ScoreBand,
} from "@/lib/utils";

export const V9_BLEND_ABSOLUTE = 0.55;
export const V9_BLEND_RELATIVE = 0.45;

export type CoreScoreV9Result = {
  score: number;
  absolute_score: number;
  relative_score: number;
  grade: Grade;
  band: ScoreBand;
  verdict: VerdictId;
  verdict_sublabels: SublabelId[];
  verdict_sublabel_display: string[];
  role_cohort: AbsoluteScoreResult["role_cohort"];
  serving_g_effective: number | null;
  cohort_id: string;
  cohort_size: number;
  subscores: {
    nutrition: number;
    ingredient: number;
    labels: number;
  };
  concerns: Array<{ type: string; message: string; severity: string }>;
  breakdown: {
    engine: "v9";
    absolute_score: number;
    relative_score: number;
    blend: { absolute: number; relative: number };
    additive_matches: MatchedAdditive[];
    ingredient_source: string;
    hard_capped: boolean;
    label_mismatch: boolean;
    sublabel_candidates: SublabelId[];
    nutrition_source?: string;
  };
};

export function blendFinalScore(absolute: number, relative: number): number {
  const raw =
    V9_BLEND_ABSOLUTE * absolute + V9_BLEND_RELATIVE * relative;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function computeCoreScoreV9(input: {
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  category: string | null;
  subcategory: string | null;
  product_name?: string | null;
  attributes?: Record<string, string> | null;
  ingredientRows?: IngredientIntelligenceRow[];
  /** Other absolutes in same cohort (excluding self optional). */
  cohortAbsolutes?: number[];
}): CoreScoreV9Result {
  const abs = computeAbsoluteScore(input);

  const cohort_id = buildCohortId(
    input.category,
    input.subcategory,
    abs.role_cohort,
  );

  const cohortList = input.cohortAbsolutes ?? [];
  const { relative, cohort_size } = computeRelativeScore(
    abs.absolute,
    cohortList,
  );

  const score = blendFinalScore(abs.absolute, relative);
  const verdict = determineVerdict({
    absolute: abs.absolute,
    role_cohort: abs.role_cohort,
    hazardous: abs.hazardous,
  });

  const sublabelCtx = {
    perServe: abs.perServe,
    ingredients_raw: input.ingredients_raw,
    ingredientRows: input.ingredientRows ?? [],
    role_cohort: abs.role_cohort,
    absolute: abs.absolute,
    relative,
    cohort_size,
    hazardous: abs.hazardous,
    label_mismatch: abs.label_mismatch,
  };

  const sublabel_candidates = pickVerdictSublabels(verdict, sublabelCtx, 6);
  const verdict_sublabels = pickVerdictSublabels(verdict, sublabelCtx, 3);

  const concerns = abs.additive_matches.map((m) => ({
    type: "additive",
    message: m.name,
    severity: m.tier,
  }));

  return {
    score,
    absolute_score: abs.absolute,
    relative_score: relative,
    grade: gradeFromScore(score),
    band: bandFromScore(score),
    verdict,
    verdict_sublabels,
    verdict_sublabel_display: sublabelsToDisplay(verdict_sublabels),
    role_cohort: abs.role_cohort,
    serving_g_effective: abs.serving_g_effective,
    cohort_id,
    cohort_size,
    subscores: abs.subscores,
    concerns,
    breakdown: {
      engine: "v9",
      absolute_score: abs.absolute,
      relative_score: relative,
      blend: { absolute: V9_BLEND_ABSOLUTE, relative: V9_BLEND_RELATIVE },
      additive_matches: abs.additive_matches,
      ingredient_source: abs.ingredient_source,
      hard_capped: abs.hazardous,
      label_mismatch: abs.label_mismatch,
      sublabel_candidates,
      nutrition_source:
        typeof input.nutrition?.source === "string"
          ? input.nutrition.source
          : undefined,
    },
  };
}

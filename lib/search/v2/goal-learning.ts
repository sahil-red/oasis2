/**
 * §3b / §10 — refine goal_trait_map weights from user click behavior.
 */
import { adminClient } from "@/lib/supabase/admin";
import { calibrateTraitConfidence } from "@/lib/search/v2/trait-calibration";
import { effectiveTraitScore } from "@/lib/search/v2/traits";
import type { GoalTraitWeights, ProductSearchIndexRow, TraitId } from "@/lib/search/v2/types";
import { TRAIT_IDS } from "@/lib/search/v2/types";

const LEARNING_RATE = 0.12;

function normalizeWeights(w: GoalTraitWeights): GoalTraitWeights {
  let sum = 0;
  for (const id of TRAIT_IDS) {
    const v = w[id];
    if (v && v > 0) sum += v;
  }
  if (sum <= 0) return w;
  const out: GoalTraitWeights = {};
  for (const id of TRAIT_IDS) {
    const v = w[id];
    if (v && v > 0) out[id] = v / sum;
  }
  return out;
}

/** Nudge goal weights toward traits exhibited by a clicked product. */
export async function refineGoalWeightsFromClick(
  goalId: string,
  row: ProductSearchIndexRow,
): Promise<void> {
  try {
    const supabase = adminClient();
    const { data: goal } = await supabase
      .from("goal_trait_map")
      .select("trait_weights, support_count")
      .eq("goal_id", goalId)
      .maybeSingle();

    if (!goal?.trait_weights) return;

    const current = goal.trait_weights as GoalTraitWeights;
    const clicked: GoalTraitWeights = {};

    for (const id of TRAIT_IDS) {
      const raw = row.traits[id];
      if (raw == null) continue;
      const effective = effectiveTraitScore(id, raw, row, calibrateTraitConfidence);
      if (effective > 0.35) clicked[id] = effective;
    }

    const merged: GoalTraitWeights = { ...current };
    for (const id of TRAIT_IDS) {
      const old = current[id] ?? 0;
      const signal = clicked[id] ?? 0;
      if (old > 0 || signal > 0) {
        merged[id] = old * (1 - LEARNING_RATE) + signal * LEARNING_RATE;
      }
    }

    const weights = normalizeWeights(merged);
    await supabase
      .from("goal_trait_map")
      .update({
        trait_weights: weights,
        support_count: Number(goal.support_count ?? 0) + 1,
        source: "learned",
        updated_at: new Date().toISOString(),
      })
      .eq("goal_id", goalId);
  } catch {
    // non-fatal
  }
}

/**
 * §3b Nutrition Graph — embedding-keyed, LLM-composed goals.
 */
import { createHash } from "node:crypto";
import { deepseekChat, extractJsonObject } from "@/lib/search/deepseek-client";
import { adminClient } from "@/lib/supabase/admin";
import { cosineSimilarity, embedText } from "@/lib/search/v2/embeddings";
import { validateTraitWeights } from "@/lib/search/v2/llm-intent";
import { calibrateTraitConfidence } from "@/lib/search/v2/trait-calibration";
import { effectiveTraitScore } from "@/lib/search/v2/traits";
import type {
  GoalTraitMapRow,
  GoalTraitWeights,
  ProductSearchIndexRow,
  TraitId,
} from "@/lib/search/v2/types";
import { GOAL_EMBEDDING_THRESHOLD, TRAIT_IDS } from "@/lib/search/v2/types";

/** Bootstrap seeds only (~10 goals) — §3b */
export const SEED_GOAL_TRAIT_MAP: Omit<GoalTraitMapRow, "goal_embedding">[] = [
  {
    goal_id: "running",
    goal_phrase: "running endurance",
    display_name: "Running / endurance",
    trait_weights: {
      hydration: 0.35,
      electrolytes: 0.3,
      slow_energy: 0.15,
      low_sugar: 0.1,
      whole_food: 0.1,
    },
    source: "seed",
    confidence: 1,
    support_count: 0,
  },
  {
    goal_id: "pcos",
    goal_phrase: "PCOS friendly",
    display_name: "PCOS-friendly",
    trait_weights: {
      fiber_density: 0.3,
      low_sugar: 0.3,
      whole_food: 0.2,
      low_calorie_density: 0.1,
      clean_label: 0.1,
    },
    source: "seed",
    confidence: 1,
    support_count: 0,
  },
  {
    goal_id: "diabetes",
    goal_phrase: "diabetes friendly",
    display_name: "Diabetes-friendly",
    trait_weights: {
      fiber_density: 0.3,
      low_sugar: 0.3,
      satiety: 0.2,
      whole_food: 0.1,
      low_sodium: 0.1,
    },
    source: "seed",
    confidence: 1,
    support_count: 0,
  },
  {
    goal_id: "muscle_gain",
    goal_phrase: "muscle gain bulking",
    display_name: "Muscle gain",
    trait_weights: {
      protein_density: 0.45,
      slow_energy: 0.2,
      whole_food: 0.15,
      clean_label: 0.1,
      satiety: 0.1,
    },
    source: "seed",
    confidence: 1,
    support_count: 0,
  },
  {
    goal_id: "kids_tiffin",
    goal_phrase: "kids tiffin school lunch",
    display_name: "Kids tiffin",
    trait_weights: {
      kid_friendly: 0.3,
      clean_label: 0.25,
      low_sugar: 0.2,
      calcium_rich: 0.15,
      whole_food: 0.1,
    },
    source: "seed",
    confidence: 1,
    support_count: 0,
  },
  {
    goal_id: "weight_loss",
    goal_phrase: "weight loss fat loss",
    display_name: "Weight loss",
    trait_weights: {
      low_calorie_density: 0.3,
      low_sugar: 0.25,
      fiber_density: 0.2,
      satiety: 0.15,
      clean_label: 0.1,
    },
    source: "seed",
    confidence: 1,
    support_count: 0,
  },
  {
    goal_id: "gym",
    goal_phrase: "gym fitness workout",
    display_name: "Gym / fitness",
    trait_weights: {
      protein_density: 0.4,
      clean_label: 0.2,
      low_sugar: 0.15,
      whole_food: 0.15,
      satiety: 0.1,
    },
    source: "seed",
    confidence: 1,
    support_count: 0,
  },
];

const GOAL_DECOMPOSE_SYSTEM = `Decompose a shopper goal into trait weights over this fixed vocabulary only:
${TRAIT_IDS.join(", ")}
Return JSON: {"weights":{trait:number},"reasons":{trait:string}}
Unknown traits dropped. Renormalize weights to sum 1.`;

export async function resolveGoalWeights(
  goalPhrase: string,
  goalMap: Map<string, GoalTraitMapRow>,
): Promise<{ weights: GoalTraitWeights; goal_id: string | null; llm_calls: number }> {
  const phrase = goalPhrase.trim();
  if (!phrase) return { weights: {}, goal_id: null, llm_calls: 0 };

  const queryEmbed = await embedText(phrase);
  if (queryEmbed.length) {
    let best: GoalTraitMapRow | null = null;
    let bestSim = 0;
    for (const row of goalMap.values()) {
      if (!row.goal_embedding?.length) continue;
      const sim = cosineSimilarity(queryEmbed, row.goal_embedding);
      if (sim >= GOAL_EMBEDDING_THRESHOLD && sim > bestSim) {
        best = row;
        bestSim = sim;
      }
    }
    if (best) {
      return { weights: best.trait_weights, goal_id: best.goal_id, llm_calls: 0 };
    }
  }

  try {
    const { content } = await deepseekChat({
      usageKind: "search",
      jsonObject: true,
      maxTokens: 600,
      system: GOAL_DECOMPOSE_SYSTEM,
      user: `Goal: ${phrase}`,
    });
    const parsed = extractJsonObject(content) as { weights?: Record<string, number> };
    const weights = validateTraitWeights(parsed.weights ?? {});
    const goal_id = await persistLearnedGoal(phrase, weights);
    return { weights, goal_id, llm_calls: 1 };
  } catch {
    return { weights: {}, goal_id: null, llm_calls: 0 };
  }
}

function slugGoalId(phrase: string): string {
  const base = phrase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  const hash = createHash("sha256").update(phrase).digest("hex").slice(0, 8);
  return base ? `${base}_${hash}` : `goal_${hash}`;
}

/** Persist LLM-decomposed goal into Nutrition Graph (§3b learning). */
export async function persistLearnedGoal(
  goalPhrase: string,
  weights: GoalTraitWeights,
): Promise<string | null> {
  if (!Object.keys(weights).length) return null;
  const goal_id = slugGoalId(goalPhrase);
  const goal_embedding = await embedText(goalPhrase);
  try {
    const supabase = adminClient();
    await supabase.from("goal_trait_map").upsert(
      {
        goal_id,
        goal_phrase: goalPhrase,
        display_name: goalPhrase,
        trait_weights: weights,
        goal_embedding: goal_embedding.length ? goal_embedding : null,
        source: "llm",
        confidence: 0.85,
        support_count: 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "goal_id" },
    );
    return goal_id;
  } catch {
    return goal_id;
  }
}

export function computeGoalFit(
  row: ProductSearchIndexRow,
  weights: GoalTraitWeights,
): { score: number; contributions: Array<{ trait: TraitId; weight: number; effective: number }> } {
  let sumW = 0;
  let sum = 0;
  const contributions: Array<{ trait: TraitId; weight: number; effective: number }> = [];

  for (const [trait, weight] of Object.entries(weights) as Array<[TraitId, number]>) {
    if (!weight || weight <= 0) continue;
    const raw = row.traits[trait];
    if (raw == null) continue;
    const effective = effectiveTraitScore(trait, raw, row, calibrateTraitConfidence);
    if (effective <= 0) continue;
    sumW += weight;
    sum += weight * effective;
    contributions.push({ trait, weight, effective });
  }

  return { score: sumW > 0 ? sum / sumW : 0, contributions };
}

export function goalDisplayName(goalId: string, goalMap?: Map<string, GoalTraitMapRow>): string {
  return goalMap?.get(goalId)?.display_name ?? goalId;
}

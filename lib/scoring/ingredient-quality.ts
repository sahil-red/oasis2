import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";
import { uniqueIngredientsFromList } from "@/lib/scoring/normalize-ingredient-name";
import { scoreAdditives, type MatchedAdditive } from "@/lib/scoring/rules";

const TIER_PENALTY: Record<string, number> = {
  innocuous: 0,
  watchful: 2,
  problematic: 6,
  hazardous: 30,
};

function positionWeight(index: number): number {
  return Math.exp(-index / 3);
}

export type IngredientQualityResult = {
  score: number;
  hazardous: boolean;
  weighted_nova: number | null;
  nova4_share: number;
  matches: MatchedAdditive[];
  source: "intelligence" | "rules_fallback";
};

/** Aggregate LLM ingredient intelligence → 0–30 subscore. */
export function scoreIngredientQuality(
  ingredients_raw: string | null,
  rows: IngredientIntelligenceRow[],
): IngredientQualityResult {
  const rules = scoreAdditives(ingredients_raw);
  const names = uniqueIngredientsFromList(ingredients_raw);

  if (!rows.length || rows.length < Math.min(2, names.length)) {
    return {
      score: rules.score,
      hazardous: rules.hazardous,
      weighted_nova: null,
      nova4_share: 0,
      matches: rules.matches,
      source: "rules_fallback",
    };
  }

  const ordered = names
    .map((n) => rows.find((r) => r.normalized_name === n))
    .filter((r): r is IngredientIntelligenceRow => r != null);

  if (!ordered.length) {
    return {
      score: rules.score,
      hazardous: rules.hazardous,
      weighted_nova: null,
      nova4_share: 0,
      matches: rules.matches,
      source: "rules_fallback",
    };
  }

  let wSum = 0;
  let qualitySum = 0;
  let novaWSum = 0;
  let nova4W = 0;

  ordered.forEach((r, i) => {
    const w = positionWeight(i);
    wSum += w;
    qualitySum += (r.intrinsic_quality ?? 50) * w;
    novaWSum += (r.nova_class ?? 4) * w;
    if (r.nova_class === 4) nova4W += w;
  });

  const avgQuality = wSum > 0 ? qualitySum / wSum : 50;
  const weightedNova = wSum > 0 ? novaWSum / wSum : 4;
  const nova4Share = wSum > 0 ? nova4W / wSum : 0;

  let score = Math.round((avgQuality / 100) * 30);

  for (const r of ordered) {
    score -= TIER_PENALTY[r.concern_tier] ?? 0;
  }

  if (nova4Share > 0.4) score -= 4;
  if (nova4Share > 0.6) score -= 4;

  const hazardous =
    rules.hazardous ||
    ordered.some((r) => r.concern_tier === "hazardous");

  score = Math.max(0, Math.min(30, score));

  return {
    score,
    hazardous,
    weighted_nova: weightedNova,
    nova4_share: nova4Share,
    matches: rules.matches,
    source: "intelligence",
  };
}

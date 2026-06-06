import { parseSearchIntent } from "@/lib/search/intent";
import type { AiSearchPreferences } from "@/lib/search/ai-usage";
import { generateCandidates } from "@/lib/search/v2/candidate-generation";
import { buildGoalBuckets } from "@/lib/search/v2/buckets";
import { attachExplainability } from "@/lib/search/v2/explain";
import { goalDisplayName, resolveGoalWeights } from "@/lib/search/v2/goal-graph";
import { getSearchIndexSnapshot } from "@/lib/search/v2/index-queries";
import { rankCandidates } from "@/lib/search/v2/ranking";
import { retrieveAndRerank } from "@/lib/search/v2/retrieve";
import { cloneIntent, RELAXATION_LADDER } from "@/lib/search/v2/relaxation";
import type { SearchIntentV2, SearchV2Result } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN } from "@/lib/search/v2/types";

const MIN_RESULTS = 3;

function buildSummary(intent: SearchIntentV2, count: number, relaxed: boolean, steps: string[]): string {
  if (count === 0) return "No products matched your filters — try broadening the request.";
  if (intent.kind === "goal" && intent.goal_id) {
    const name = goalDisplayName(intent.goal_id);
    const base = `Top picks for ${name.toLowerCase()} (${count} matches)`;
    return relaxed && steps.length ? `${base}. ${steps.join("; ")}.` : base;
  }
  if (intent.primary_type) {
    const base = `Best ${intent.primary_type} matches (${count})`;
    return relaxed && steps.length ? `${base}. ${steps.join("; ")}.` : base;
  }
  return relaxed && steps.length
    ? `Showing ${count} matches. ${steps.join("; ")}.`
    : `Showing ${count} closest matches.`;
}

/**
 * §6 Online pipeline:
 *   intent → candidate generation (~500) → retrieve/rerank (~50) → rank (~10) → relax if sparse
 */
export async function runSearchV2(
  rawQuery: string,
  opts: { limit?: number; preferences?: AiSearchPreferences | null } = {},
): Promise<SearchV2Result> {
  const limit = Math.min(40, Math.max(4, opts.limit ?? 24));
  const snapshot = await getSearchIndexSnapshot();
  let intent = parseSearchIntent(rawQuery, opts.preferences);
  let relaxation_steps: string[] = [];
  let relaxed = false;
  let minDataQuality = DATA_QUALITY_MIN;

  let candidates = generateCandidates(
    snapshot.index,
    intent,
    snapshot.profiles,
    snapshot.goalMap,
    minDataQuality,
  );
  let stepIdx = 0;

  // §11 relaxation — never primary_type or required_flavour
  while (candidates.length < MIN_RESULTS && stepIdx < RELAXATION_LADDER.length) {
    const step = RELAXATION_LADDER[stepIdx]!;
    stepIdx += 1;
    if (step.relaxesDataQuality) {
      minDataQuality = 0.2;
    } else {
      intent = step.apply(cloneIntent(intent));
    }
    candidates = generateCandidates(
      snapshot.index,
      intent,
      snapshot.profiles,
      snapshot.goalMap,
      minDataQuality,
    );
    relaxation_steps.push(step.label);
    relaxed = true;
    if (candidates.length >= MIN_RESULTS) break;
  }

  const reranked = retrieveAndRerank(candidates, intent);

  const goalWeights =
    intent.kind === "goal" && intent.goal_id
      ? resolveGoalWeights(intent.goal_id, snapshot.goalMap)
      : null;

  let ranked = rankCandidates(reranked, intent, snapshot.goalMap, Math.max(limit, 50));
  ranked = attachExplainability(ranked, goalWeights);
  const items = ranked.slice(0, limit);
  const buckets = intent.kind === "goal" ? buildGoalBuckets(ranked, goalWeights) : null;

  return {
    intent,
    candidates_total: candidates.length,
    items,
    buckets,
    relaxed,
    relaxation_steps,
    rank_source: intent.kind === "goal" ? "v2_goal" : "v2_structured",
    summary: buildSummary(intent, items.length, relaxed, relaxation_steps),
  };
}

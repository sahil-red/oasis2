import { resolveSearchIntent } from "@/lib/search/intent";
import type { AiSearchPreferences } from "@/lib/search/ai-usage";
import { generateCandidates } from "@/lib/search/v2/candidate-generation";
import { buildGoalBuckets } from "@/lib/search/v2/buckets";
import { resolveComparisonReference, type ComparisonContext } from "@/lib/search/v2/comparison";
import { attachExplainability } from "@/lib/search/v2/explain";
import { goalDisplayName, resolveGoalWeights } from "@/lib/search/v2/goal-graph";
import { buildIndexCatalogMeta } from "@/lib/search/v2/index-meta";
import { getSearchIndexSnapshot } from "@/lib/search/v2/index-queries";
import { applyExplorationSlot } from "@/lib/search/v2/popularity";
import { rankCandidates } from "@/lib/search/v2/ranking";
import { retrieveAndRerank } from "@/lib/search/v2/retrieve";
import { relaxIntentDeterministic, relaxIntentWithLlm } from "@/lib/search/v2/relaxation";
import { nearestPrimaryTypes } from "@/lib/search/v2/type-neighbors";
import { isPrecisionAtRisk, verifyTopCandidates } from "@/lib/search/v2/verification";
import type { SearchIntentV2, SearchV2Result } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN } from "@/lib/search/v2/types";

const MIN_RESULTS = 3;

function buildSummary(intent: SearchIntentV2, count: number, relaxed: boolean, steps: string[]): string {
  if (count === 0) return "No products matched your filters — try broadening the request.";
  if (intent.kind === "goal" && intent.goal_phrase) {
    const base = `Top picks for ${intent.goal_phrase.toLowerCase()} (${count} matches)`;
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

/** §6 Online funnel */
export async function runSearchV2(
  rawQuery: string,
  opts: { limit?: number; preferences?: AiSearchPreferences | null } = {},
): Promise<SearchV2Result> {
  const started = Date.now();
  const limit = Math.min(40, Math.max(4, opts.limit ?? 24));
  const snapshot = await getSearchIndexSnapshot();
  const catalogMeta = buildIndexCatalogMeta(snapshot.index);

  let llm_calls = 0;
  const resolved = await resolveSearchIntent(rawQuery, {
    preferences: opts.preferences,
    catalogMeta,
  });
  let intent = resolved.intent;
  llm_calls += resolved.llm_calls;

  let relaxation_steps: string[] = [];
  let relaxed = false;
  let minDataQuality = DATA_QUALITY_MIN;

  let comparison: ComparisonContext | null = null;
  if (intent.comparison_ref && intent.comparison_mode) {
    const resolved = await resolveComparisonReference(intent.comparison_ref, snapshot.index);
    if (resolved) {
      comparison = { ...resolved, mode: intent.comparison_mode };
    }
  }

  // Resolve trait weights whenever a goal_phrase exists — not only for pure goal
  // queries. A directed "diabetic bread" keeps its type filter (candidate gen only
  // applies category-selection for kind==="goal") but ranks by diabetic traits.
  let goalWeights = null as Awaited<ReturnType<typeof resolveGoalWeights>> | null;
  if (intent.goal_phrase) {
    goalWeights = await resolveGoalWeights(intent.goal_phrase, snapshot.goalMap);
    intent = { ...intent, goal_id: goalWeights.goal_id };
    llm_calls += goalWeights.llm_calls;
  }

  let candidates = await generateCandidates(
    snapshot.index,
    intent,
    snapshot.profiles,
    goalWeights?.weights ?? null,
    minDataQuality,
  );

  const typeNeighbors = intent.primary_type
    ? await nearestPrimaryTypes(intent.primary_type, snapshot.index)
    : [];

  while (candidates.length < MIN_RESULTS) {
    const deterministic = relaxIntentDeterministic(intent);
    if (deterministic) {
      intent = deterministic.intent;
      relaxation_steps.push(deterministic.explanation);
      relaxed = true;
    } else if ((process.env.DEEPSEEK_SEARCH_API_KEY || process.env.DEEPSEEK_API_KEY)?.trim()) {
      try {
        const relaxedResult = await relaxIntentWithLlm(intent, { type_neighbors: typeNeighbors });
        llm_calls += relaxedResult.llm_calls;
        intent = relaxedResult.intent;
        relaxation_steps.push(relaxedResult.explanation);
        relaxed = true;
      } catch {
        break;
      }
    } else {
      break;
    }

    minDataQuality = Math.max(0.35, minDataQuality - 0.1);
    candidates = await generateCandidates(
      snapshot.index,
      intent,
      snapshot.profiles,
      goalWeights?.weights ?? null,
      minDataQuality,
    );
    if (candidates.length >= MIN_RESULTS) break;
    if (relaxation_steps.length >= 4) break;
  }

  const { rows: reranked, relevanceById } = await retrieveAndRerank(candidates, intent, {
    useDbLexical: snapshot.source === "db",
  });

  let ranked = rankCandidates(
    reranked,
    intent,
    relevanceById,
    goalWeights?.weights ?? null,
    Math.max(limit, 50),
    comparison,
  );

  if (isPrecisionAtRisk(intent)) {
    const v = await verifyTopCandidates(
      ranked.map((r) => r.row),
      intent,
    );
    llm_calls += v.llm_calls;
    if (v.llm_calls > 0) {
      const keep = new Set(v.rows.map((r) => r.product_id));
      ranked = ranked.filter((r) => keep.has(r.row.product_id));
    }
  }

  ranked = attachExplainability(ranked, goalWeights?.weights ?? null);

  const { items, explored } = applyExplorationSlot(ranked, intent.raw_query, limit);
  const buckets =
    intent.kind === "goal" ? buildGoalBuckets(ranked, goalWeights?.weights ?? null) : null;

  const goalLabel =
    intent.goal_id != null
      ? goalDisplayName(intent.goal_id, snapshot.goalMap)
      : intent.goal_phrase;

  const comparisonNote =
    comparison && items.length
      ? ` Compared against ${comparison.reference_name}.`
      : "";

  return {
    intent: { ...intent, goal_phrase: intent.goal_phrase ?? goalLabel ?? null },
    candidates_total: candidates.length,
    items,
    buckets,
    relaxed,
    relaxation_steps,
    rank_source: intent.kind === "goal" ? "v2_goal" : "v2_structured",
    summary: buildSummary(intent, items.length, relaxed, relaxation_steps) + comparisonNote,
    llm_calls,
    latency_ms: Date.now() - started,
    explored,
  };
}

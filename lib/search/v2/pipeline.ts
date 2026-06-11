import { resolveSearchIntent } from "@/lib/search/intent";
import type { AiSearchPreferences } from "@/lib/search/ai-usage";
import { generateCandidates, typeMatchTier } from "@/lib/search/v2/candidate-generation";
import { fetchCandidatePool } from "@/lib/search/v2/db-candidates";
import { resolveComparisonReference, type ComparisonContext } from "@/lib/search/v2/comparison";
import { attachExplainability } from "@/lib/search/v2/explain";
import { goalDisplayName, resolveGoalWeights } from "@/lib/search/v2/goal-graph";
import { getSearchIndexSnapshot } from "@/lib/search/v2/index-queries";
import type { GoalTraitWeights } from "@/lib/search/v2/types";
import { applyExplorationSlot } from "@/lib/search/v2/popularity";
import { rankCandidates } from "@/lib/search/v2/ranking";
import { retrieveAndRerank } from "@/lib/search/v2/retrieve";
import { relaxIntentDeterministic, relaxIntentWithLlm } from "@/lib/search/v2/relaxation";
import { nearestPrimaryTypes } from "@/lib/search/v2/type-neighbors";
import { semanticTypeMatches } from "@/lib/search/v2/type-centroids";
import { isPrecisionAtRisk, verifyTopCandidates } from "@/lib/search/v2/verification";
import type { SearchIntentV2, SearchV2Result } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN } from "@/lib/search/v2/types";

const MIN_RESULTS = 3;
/** Restore V1 hard sugar cap (5g/100g) for diabetic/pcos queries — lost in V2 migration */
const DIABETIC_RE = /diabet(?:ic|es)|pcos/i;

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
  const limit = Math.min(100, Math.max(8, opts.limit ?? 48));
  const snapshot = await getSearchIndexSnapshot();
  const catalogMeta = snapshot.catalogMeta;

  // Fetch candidates either from the in-memory index or, in pgvector mode, from the DB
  // (filtered vector-KNN) — then the same in-memory refine runs over the bounded pool.
  const getCandidates = async (
    intentArg: SearchIntentV2,
    gw: GoalTraitWeights | null,
    minQ: number,
  ) => {
    const pool =
      snapshot.source === "pgvector"
        ? await fetchCandidatePool(intentArg, minQ)
        : snapshot.index;
    return generateCandidates(pool, intentArg, snapshot.profiles, gw, minQ, limit);
  };

  let llm_calls = 0;
  const resolved = await resolveSearchIntent(rawQuery, {
    preferences: opts.preferences,
    catalogMeta,
  });
  let intent = resolved.intent;
  llm_calls += resolved.llm_calls;

  // §6b Restore 5g sugar hard-cap for diabetic/pcos — the V2 LLM uses trait ranking
  // (diabetic_friendly) which is a SORT, not a GATE. Products above 5g/100g sugar
  // must be excluded, not just ranked lower.
  if (DIABETIC_RE.test(rawQuery)) {
    const existing = intent.constraints.max_sugar_g;
    intent = {
      ...intent,
      constraints: {
        ...intent.constraints,
        max_sugar_g: existing != null ? Math.min(existing, 5) : 5,
      },
    };
  }

  let relaxation_steps: string[] = [];
  let relaxed = false;
  let minDataQuality = DATA_QUALITY_MIN;

  let comparison: ComparisonContext | null = null;
  if (intent.comparison_ref && intent.comparison_mode) {
    const resolved = await resolveComparisonReference(intent.comparison_ref);
    if (resolved) {
      comparison = { ...resolved, mode: intent.comparison_mode };
    }
  }

  // Resolve trait weights whenever a goal_phrase exists — not only for pure goal queries.
  // A directed "diabetic bread" keeps its type filter (candidate gen only applies
  // category-selection for kind==="goal") but ranks by diabetic traits.
  let goalWeights = null as Awaited<ReturnType<typeof resolveGoalWeights>> | null;
  let candidates: Awaited<ReturnType<typeof generateCandidates>>;

  // LLM provides trait_weights directly → skip separate goal decomposition call
  if (intent.trait_weights && Object.keys(intent.trait_weights).length > 0) {
    goalWeights = { weights: intent.trait_weights, goal_id: intent.goal_id, llm_calls: 0 };
    candidates = await getCandidates(intent, goalWeights.weights, minDataQuality);
  } else if (intent.kind === "goal" && intent.goal_phrase) {
    // Goal route: weights drive candidate category-selection → must resolve first.
    goalWeights = await resolveGoalWeights(intent.goal_phrase, snapshot.goalMap);
    intent = { ...intent, goal_id: goalWeights.goal_id };
    llm_calls += goalWeights.llm_calls;
    candidates = await getCandidates(intent, goalWeights.weights, minDataQuality);
  } else {
    // Directed: goal weights only feed ranking, so resolve them in PARALLEL with
    // candidate generation+retrieval instead of serially (saves a ~2.5s DeepSeek call).
    const [gw, cands] = await Promise.all([
      intent.goal_phrase ? resolveGoalWeights(intent.goal_phrase, snapshot.goalMap) : Promise.resolve(null),
      getCandidates(intent, null, minDataQuality),
    ]);
    goalWeights = gw;
    if (gw) {
      intent = { ...intent, goal_id: gw.goal_id };
      llm_calls += gw.llm_calls;
    }
    candidates = cands;
  }

  // Relax ONLY when truly empty — if even 1-2 products genuinely match (e.g. a niche
  // "coconut water" with 2 entries), show them rather than broadening to less-relevant
  // items. LLM broadening is capped to one call; deterministic relaxation is free.
  let llmRelaxUsed = false;
  while (candidates.length === 0) {
    const deterministic = relaxIntentDeterministic(intent);
    if (deterministic) {
      intent = deterministic.intent;
      relaxation_steps.push(deterministic.explanation);
      relaxed = true;
    } else if (!llmRelaxUsed && (process.env.DEEPSEEK_SEARCH_API_KEY || process.env.DEEPSEEK_API_KEY)?.trim()) {
      llmRelaxUsed = true;
      try {
        const typeNeighbors = intent.primary_type
          ? await nearestPrimaryTypes(intent.primary_type)
          : [];
        const relaxedResult = await relaxIntentWithLlm(intent, { type_neighbors: typeNeighbors });
        llm_calls += relaxedResult.llm_calls;
        if (!/no relaxation/i.test(relaxedResult.explanation)) {
          // Safety constraints are pinned — an LLM relaxation may not drop
          // allergen/dietary exclusions even if it tries.
          intent = {
            ...relaxedResult.intent,
            constraints: {
              ...relaxedResult.intent.constraints,
              vegan: intent.constraints.vegan,
              vegetarian: intent.constraints.vegetarian,
              gluten_free: intent.constraints.gluten_free,
              palm_oil_free: intent.constraints.palm_oil_free,
              avoid_ingredients: intent.constraints.avoid_ingredients,
              allergens_excluded: intent.constraints.allergens_excluded,
            },
          };
          relaxation_steps.push(relaxedResult.explanation);
          relaxed = true;
        }
      } catch {
        break;
      }
    } else {
      break;
    }

    minDataQuality = Math.max(0.35, minDataQuality - 0.1);
    candidates = await getCandidates(intent, goalWeights?.weights ?? null, minDataQuality);
    if (candidates.length >= MIN_RESULTS) break;
    if (relaxation_steps.length >= 4) break;
  }

  // Compute type-match tiers for explicit primary_type queries — used by the
  // sort comparator so exact type matches (milk) dominate lexical hallucination
  // matches (whey mentioning "milk" in ingredients scan_doc).
  let typeTiers: Map<string, number> | undefined;
  if (intent.primary_type) {
    const equivalents = await semanticTypeMatches(intent.primary_type);
    typeTiers = new Map(
      candidates.map((r) => [r.product_id, typeMatchTier(r, intent.primary_type!, equivalents)]),
    );
  }

  const { rows: reranked, relevanceById } = await retrieveAndRerank(candidates, intent, {
    useDbLexical: snapshot.source === "db",
  });

  // Filter type tiers to only the rows that survived retrieveAndRerank
  if (typeTiers) {
    const survivorIds = new Set(reranked.map((r) => r.product_id));
    typeTiers = new Map([...typeTiers].filter(([id]) => survivorIds.has(id)));
  }

  // Verify BEFORE ranking so that ranking scores are computed on the actual
  // display set, not on a superset later trimmed by verification.
  let filteredReranked = reranked;
  if (isPrecisionAtRisk(intent)) {
    const v = await verifyTopCandidates(filteredReranked, intent);
    llm_calls += v.llm_calls;
    if (v.llm_calls > 0) {
      const keep = new Set(v.rows.map((r) => r.product_id));
      filteredReranked = filteredReranked.filter((r) => keep.has(r.product_id));
      if (typeTiers) {
        typeTiers = new Map([...typeTiers].filter(([id]) => keep.has(id)));
      }
    }
  }

  let ranked = rankCandidates(
    filteredReranked,
    intent,
    relevanceById,
    goalWeights?.weights ?? null,
    Math.max(limit * 2, 20),
    comparison,
    typeTiers,
  );

  ranked = attachExplainability(ranked, goalWeights?.weights ?? null);

  // Exploration only makes sense under relevance ranking — under an explicit
  // sort (cheapest / highest protein) a promoted item visibly breaks the order
  // the user asked for.
  const { items, explored } =
    intent.sort === "best_match" || intent.sort == null
      ? applyExplorationSlot(ranked, intent.raw_query, limit)
      : { items: ranked.slice(0, limit), explored: false };
  const goalLabel =
    intent.goal_id != null
      ? goalDisplayName(intent.goal_id, snapshot.goalMap)
      : intent.goal_phrase;

  const comparisonNote =
    comparison && items.length
      ? ` Compared against ${comparison.reference_name}.`
      : "";

  if (process.env.SEARCH_TELEMETRY) {
    console.log(JSON.stringify({
      type: "search_telemetry",
      query: rawQuery,
      intent_source: intent.intent_source,
      llm_confidence: intent.confidence,
      candidates_before_rank: candidates.length,
      rank_limit: limit,
      ranked_count: items.length,
      relaxed,
      relaxation_steps: relaxation_steps.length,
      rank_source: intent.kind === "goal" ? "v2_goal" : "v2_structured",
      latency_ms: Date.now() - started,
    }));
  }

  return {
    intent: { ...intent, goal_phrase: intent.goal_phrase ?? goalLabel ?? null },
    candidates_total: candidates.length,
    items,
    relaxed,
    relaxation_steps,
    rank_source: intent.kind === "goal" ? "v2_goal" : "v2_structured",
    summary: buildSummary(intent, items.length, relaxed, relaxation_steps) + comparisonNote,
    llm_calls,
    latency_ms: Date.now() - started,
    explored,
    snapshotIndex: snapshot.index,
    dietary_prevalence: snapshot.dietary_prevalence,
  };
}

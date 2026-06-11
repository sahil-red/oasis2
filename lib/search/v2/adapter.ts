import { adminClient } from "@/lib/supabase/admin";
import type { AiSearchBucket, AiSearchItem, AiSearchResult } from "@/lib/search/ai-search";
import { heuristicParseProductQuery } from "@/lib/search/query-parse";
import { resolveProductVerdict } from "@/lib/scoring/verdict-resolve";
import { countCanonicalSiblings } from "@/lib/search/v2/canonical-cluster";
import { getDisplayChips } from "@/lib/search/v2/display-chips";
import type { DietaryPrevalenceMap, ProductSearchIndexRow, RankedCandidate, SearchV2Result } from "@/lib/search/v2/types";
import type { Grade, ScoreBand } from "@/lib/supabase/types";

function dataQualityWarning(score: number): string | null {
  if (score < 0.5) return "Label not verified — limited data";
  if (score < 0.75) return "Label coverage limited — verify before buying";
  return null;
}

function scoreToGrade(score: number): Grade {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function scoreToBand(score: number): ScoreBand {
  if (score >= 75) return "excellent";
  if (score >= 55) return "good";
  if (score >= 40) return "poor";
  return "bad";
}

function mapParseSource(
  source: SearchV2Result["intent"]["intent_source"],
): AiSearchResult["parse_source"] {
  if (source === "llm-groq" || source === "llm-deepseek") return "deepseek";
  return "heuristic";
}

type DisplayEnrichment = {
  image_urls: string[];
  net_weight: string | null;
  mrp_inr: number | null;
};

async function enrichDisplayFields(productIds: string[]): Promise<Map<string, DisplayEnrichment>> {
  const out = new Map<string, DisplayEnrichment>();
  if (!productIds.length) return out;
  try {
    const supabase = adminClient();
    const { data } = await supabase
      .from("products")
      .select("id, image_urls, net_weight, mrp_inr")
      .in("id", productIds.slice(0, 50));
    for (const row of data ?? []) {
      out.set(String(row.id), {
        image_urls: Array.isArray(row.image_urls) ? row.image_urls.slice(0, 1) : [],
        net_weight: (row.net_weight as string) ?? null,
        mrp_inr: row.mrp_inr != null ? Number(row.mrp_inr) : null,
      });
    }
  } catch {
    // non-fatal
  }
  return out;
}

/** Build a rich AiSearchItem from a ranked candidate, carrying nutrition + trait data through. */
function rankedToAiItem(
  c: RankedCandidate,
  display: Map<string, DisplayEnrichment>,
  snapshotIndex: ProductSearchIndexRow[],
  dietaryPrevalence: DietaryPrevalenceMap,
): AiSearchItem {
  const row = c.row;
  const extra = display.get(row.product_id);
  const scout = row.scout_score ?? Math.round(c.final_score * 100);

  // Build enriched reasons with actual values
  const enrichedReasons: string[] = [];
  for (const r of c.reasons) {
    if (/low sugar/i.test(r) && row.sugar_g != null) {
      enrichedReasons.push(`Sugar: ${row.sugar_g}g/100g`);
    } else if (/high protein/i.test(r) && row.protein_g != null) {
      enrichedReasons.push(`Protein: ${row.protein_g}g/100g`);
    } else if (/no added sugar/i.test(r)) {
      enrichedReasons.push("No added sugar");
    } else if (/low fat/i.test(r) && row.fat_g != null) {
      enrichedReasons.push(`Fat: ${row.fat_g}g/100g`);
    } else if (/high fiber/i.test(r) && row.fiber_g != null) {
      enrichedReasons.push(`Fiber: ${row.fiber_g}g/100g`);
    } else {
      enrichedReasons.push(r);
    }
  }

  return {
    id: row.product_id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    primary_type: row.primary_type,
    net_weight: extra?.net_weight ?? null,
    price_inr: row.price_inr,
    mrp_inr: extra?.mrp_inr ?? null,
    image_urls: extra?.image_urls ?? [],
    core_scores: scout
      ? {
          score: scout,
          grade: scoreToGrade(scout),
          band: scoreToBand(scout),
          // Same resolver the PDP uses — verdict badges and verdict filters now
          // work on AI results instead of silently matching nothing.
          verdict: resolveProductVerdict({
            score: scout,
            name: row.name,
            category: row.category,
            subcategory: row.subcategory,
          }),
          verdict_sublabels: [],
          relative_score: null,
          cohort_size: null,
          absolute_score: row.scout_score ?? null,
        }
      : null,
    ai_match_score: Math.round(c.final_score * 100),
    ai_health_score: row.scout_score ?? undefined,
    ai_match_reasons: enrichedReasons,
    ai_match_warning: dataQualityWarning(row.data_quality_score),
    scout_verified: row.data_quality_score >= 0.75,
    canonical_variant_count: countCanonicalSiblings(
      snapshotIndex,
      row.canonical_product_id ?? row.product_id,
    ),
    sugar_g: row.sugar_g,
    protein_g: row.protein_g,
    fat_g: row.fat_g,
    fiber_g: row.fiber_g,
    is_vegan: row.is_vegan,
    is_gluten_free: row.is_gluten_free,
    is_palm_oil_free: row.is_palm_oil_free,
    has_added_sugar: row.has_added_sugar,
    display_chips: getDisplayChips(row, dietaryPrevalence, enrichedReasons),
  };
}

export async function searchV2ToAiResult(
  v2: SearchV2Result,
  opts: { limit?: number; parseSource?: "heuristic" | "deepseek" } = {},
): Promise<AiSearchResult> {
  const limit = opts.limit ?? v2.items.length;
  const ids = v2.items.map((i) => i.row.product_id);
  const display = await enrichDisplayFields(ids);

  const dietaryPrevalence = v2.dietary_prevalence;
  const snapshotIndex = v2.snapshotIndex;

  const items: AiSearchItem[] = v2.items.map((c) =>
    rankedToAiItem(c, display, snapshotIndex, dietaryPrevalence),
  );

  const buckets: AiSearchBucket[] | null = v2.buckets?.length
    ? v2.buckets.map((b) => ({
        id: b.id,
        label: b.label,
        trait_focus: String(b.trait_focus),
        items: b.items.map((c) => rankedToAiItem(c, display, snapshotIndex, dietaryPrevalence)),
      }))
    : null;

  const parsed = heuristicParseProductQuery(v2.intent.raw_query);
  const parse_warning =
    v2.intent.intent_source === "degraded"
      ? "Limited understanding — showing best lexical matches"
      : undefined;

  return {
    parsed,
    parse_source: opts.parseSource ?? mapParseSource(v2.intent.intent_source),
    rank_source: "semantic",
    intent_tier: v2.intent.kind === "goal" ? "complex" : "structured",
    parse_warning,
    summary: v2.summary,
    items,
    buckets,
    reasons_by_product_id: Object.fromEntries(
      v2.items.map((c) => [c.row.product_id, c.reasons]),
    ),
    refinements: [],
    relaxation_explanations: v2.relaxed ? v2.relaxation_steps : [],
    limit,
    total: v2.candidates_total,
    relaxed: v2.relaxed,
    dietary_prevalence: dietaryPrevalence,
    v2: {
      goal_id: v2.intent.goal_id,
      goal_phrase: v2.intent.goal_phrase,
      llm_calls: v2.llm_calls,
      latency_ms: v2.latency_ms,
    },
  };
}

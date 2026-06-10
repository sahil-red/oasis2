/**
 * v10 opinion layer — LLM-written editorial verdicts (see v10-llm-opinion-spec.md).
 *
 * The LLM only writes prose. V9 numbers stay deterministic; everything the
 * model may cite is in the payload we build here, so there is nothing to
 * invent. Cached in core_scores.opinion per rule_version.
 */
import { deepseekChat, extractJsonObject } from "@/lib/search/deepseek-client";
import type { VerdictId } from "@/lib/scoring/verdict";

export type ProductOpinion = {
  headline: string;
  why: string;
  caveat?: string | null;
  tone: "honest" | "enthusiastic" | "skeptical" | "dismissive";
  model: string;
  rule_version: number;
  generated_at: string;
};

export type OpinionInput = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  net_weight: string | null;
  price_inr: number | null;
  score: number;
  verdict: string | null;
  role_cohort: string | null;
  absolute_score: number | null;
  relative_score: number | null;
  cohort_size: number | null;
  sublabels: string[];
  nutrition: Record<string, unknown> | null;
  serving_g: number | null;
  flagged_additives: Array<{ name: string; tier: string }>;
  label_mismatch: boolean;
  ingredients_raw: string | null;
};

export const OPINION_SYSTEM = `You're a no-nonsense grocery editor. You write 2-3 sentence verdicts on Indian
packaged foods. Voice: direct, slightly dry, never preachy. Never use marketing
words ("amazing", "delicious", "premium"). Never say "this product" — just say
what it is.

Always cite specific evidence from the data:
- If sodium is high, give the mg
- If an ingredient is concerning, name it (only ingredients present in the input)
- If marketing claims contradict the label (label_mismatch=true), say so in plain
  words ("the front says no added sugar; the panel disagrees"). NEVER echo field
  names like label_mismatch, role_cohort, or relative_score in your prose.

Adjust tone for role_cohort:
- adjunct (masala/oil/ghee): judge by ingredient quality, not macros. Per-100g
  numbers don't matter — people eat tiny amounts (serving_g tells you). Never
  praise "protein density" on an adjunct. Lead with what's actually IN it.
- treat (chocolate/cola): don't pretend it's healthy. Note if it's worse than
  category average (relative_score). Brief, accepting.
- staple/snack: lead with the macro story, then ingredient quality.

Special cases:
- flagged_additives present → mention at least the worst one by name.
- verdict "skip" with relative_score >= 80 → nuanced: best of a bad category.
- Never contradict the verdict: "skip" never gets an enthusiastic write-up.

For EACH product in the input, return one object. Output strict JSON only:
{"opinions":[{
  "id": string,            // echo the input id
  "headline": string,      // <= 80 chars, opinionated, no fluff
  "why": string,           // 2-3 sentences, cite numbers/ingredients from input
  "caveat": string|null,   // <= 60 chars, only if a specific group should skip
  "tone": "honest"|"enthusiastic"|"skeptical"|"dismissive"
}]}
No markdown, no preamble.`;

const MARKETING_WORDS = /\b(amazing|delicious|premium|tasty|yummy|awesome|wonderful)\b/i;

export type RawOpinion = {
  id?: string;
  headline?: string;
  why?: string;
  caveat?: string | null;
  tone?: string;
};

/** Spec quality gates — reject rather than ship awkward prose. */
export function validateOpinion(
  o: RawOpinion,
  verdict: VerdictId | string | null,
): string | null {
  if (!o.headline?.trim() || !o.why?.trim()) return "missing headline/why";
  if (o.headline.length > 110) return "headline too long";
  if (o.why.length > 480) return "why too long";
  if ((o.caveat ?? "").length > 90) return "caveat too long";
  if (MARKETING_WORDS.test(`${o.headline} ${o.why}`)) return "marketing words";
  if (verdict === "skip" && o.tone === "enthusiastic") return "tone contradicts skip verdict";
  return null;
}

function slimNutrition(n: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!n) return null;
  const keys = [
    "energy_kcal_100g",
    "protein_g_100g",
    "carbs_g_100g",
    "sugar_g_100g",
    "added_sugar_g_100g",
    "fiber_g_100g",
    "fat_g_100g",
    "saturated_fat_g_100g",
    "trans_fat_g_100g",
    "sodium_mg_100g",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) if (n[k] != null) out[k] = n[k];
  return Object.keys(out).length ? out : null;
}

function payloadFor(p: OpinionInput): Record<string, unknown> {
  return {
    id: p.id,
    product: {
      name: p.name,
      brand: p.brand,
      category: p.category,
      subcategory: p.subcategory,
      net_weight: p.net_weight,
      price_inr: p.price_inr,
    },
    scoring: {
      score: p.score,
      verdict: p.verdict,
      role_cohort: p.role_cohort,
      absolute_score: p.absolute_score,
      relative_score: p.relative_score,
      cohort_size: p.cohort_size,
      rule_based_chips: p.sublabels,
    },
    nutrition_per_100g: slimNutrition(p.nutrition),
    serving_g: p.serving_g,
    flagged_additives: p.flagged_additives,
    label_mismatch: p.label_mismatch,
    // First entries carry the position weight; plenty for citing by name.
    ingredients_raw: p.ingredients_raw ? p.ingredients_raw.slice(0, 900) : null,
  };
}

export type OpinionBatchResult = {
  ok: Map<string, { headline: string; why: string; caveat: string | null; tone: ProductOpinion["tone"] }>;
  rejected: Array<{ id: string; reason: string }>;
};

/** One LLM call for a batch of products (spec: ~8 per call). */
export async function generateOpinionBatch(batch: OpinionInput[]): Promise<OpinionBatchResult> {
  const ok: OpinionBatchResult["ok"] = new Map();
  const rejected: OpinionBatchResult["rejected"] = [];
  if (!batch.length) return { ok, rejected };

  const { content } = await deepseekChat({
    usageKind: "search",
    jsonObject: true,
    // ~170 output tokens per product + JSON overhead.
    maxTokens: Math.max(2000, batch.length * 420),
    timeoutMs: 120_000,
    system: OPINION_SYSTEM,
    user: JSON.stringify({ products: batch.map(payloadFor) }),
  });

  const parsed = extractJsonObject(content) as { opinions?: RawOpinion[] };
  const byId = new Map(batch.map((p) => [p.id, p]));
  for (const raw of parsed.opinions ?? []) {
    if (!raw.id || !byId.has(raw.id)) continue;
    const input = byId.get(raw.id)!;
    const problem = validateOpinion(raw, input.verdict);
    if (problem) {
      rejected.push({ id: raw.id, reason: problem });
      continue;
    }
    const tone = (["honest", "enthusiastic", "skeptical", "dismissive"] as const).includes(
      raw.tone as ProductOpinion["tone"],
    )
      ? (raw.tone as ProductOpinion["tone"])
      : "honest";
    ok.set(raw.id, {
      headline: raw.headline!.trim(),
      why: raw.why!.trim(),
      caveat: raw.caveat?.trim() || null,
      tone,
    });
  }
  for (const p of batch) {
    if (!ok.has(p.id) && !rejected.some((r) => r.id === p.id)) {
      rejected.push({ id: p.id, reason: "missing from response" });
    }
  }
  return { ok, rejected };
}

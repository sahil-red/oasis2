import {
  deepseekChat,
  extractJsonObject,
  type DeepseekUsage,
} from "@/lib/search/deepseek-client";
import type { ProductListItem } from "@/lib/products/queries";
import type { ParsedProductQuery } from "@/lib/search/query-parse";
import { rankCandidatesSemantically } from "@/lib/search/semantic-rank";
import type { ProductNutrition } from "@/lib/supabase/types";

export type LlmRankedItem = {
  product_id: string;
  score: number;
  reasons: string[];
  warning?: string | null;
};

export type LlmRankResult = {
  summary: string;
  rankings: LlmRankedItem[];
  usage: DeepseekUsage | null;
  source: "deepseek" | "fallback";
  warning?: string;
};

const RANK_SYSTEM = `You rank Indian grocery products for a shopper's natural-language request.
Return exactly one JSON object, no markdown.

Schema:
{
  "summary": string,
  "rankings": [
    {
      "product_id": string,
      "score": number,
      "reasons": string[],
      "warning": string | null
    }
  ]
}

Rules:
- score is 0-100 for how well the product matches what the user asked for (product TYPE and constraints), not just keyword overlap.
- Prefer the actual product type: jar/tin of ghee beats sweets that contain ghee; soft drinks/sodas beat plain water; Coke Zero beats sugary soda.
- reasons: 1-3 short phrases shown to the user (e.g. "Zero sugar cola", "Grass-fed on label").
- warning: null, or a brief trade-off if the product only partially fits.
- Only include product_ids from the candidate list. Omit poor matches entirely.
- Order rankings best-first. Return at most the number requested.
- summary: one sentence for the user about what you found (max 28 words).`;

function compactCandidate(p: ProductListItem) {
  const n = p.nutrition;
  const sugar =
    (typeof n?.sugar_g_100g === "number" ? n.sugar_g_100g : null) ??
    (typeof n?.added_sugar_g_100g === "number" ? n.added_sugar_g_100g : null);
  return {
    product_id: p.id,
    name: (p.name ?? "").slice(0, 120),
    brand: p.brand ?? null,
    subcategory: p.subcategory ?? null,
    category: p.category ?? null,
    price_inr: p.price_inr ?? p.mrp_inr ?? null,
    sugar_g_100g: sugar,
    protein_g_100g: num(n, "protein_g_100g"),
    scout_score: p.core_scores?.score ?? null,
    verdict: p.core_scores?.verdict ?? null,
    ingredients_snippet: (p.ingredients_raw ?? "").slice(0, 160) || null,
  };
}

function num(n: ProductNutrition | null | undefined, key: keyof ProductNutrition): number | null {
  const v = n?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function constraintsBlock(parsed: ParsedProductQuery): string {
  const c = parsed.hard_constraints;
  const lines: string[] = [];
  if (c.max_sugar_g_100g != null) lines.push(`max sugar: ${c.max_sugar_g_100g}g per 100g`);
  if (c.max_price != null) lines.push(`max price: ₹${c.max_price}`);
  if (c.max_fat_g_100g != null) lines.push(`max fat: ${c.max_fat_g_100g}g per 100g`);
  if (c.min_protein_g_100g != null) lines.push(`min protein: ${c.min_protein_g_100g}g per 100g`);
  if (c.vegetarian) lines.push("vegetarian only");
  if (c.avoid_ingredients?.length) lines.push(`avoid: ${c.avoid_ingredients.join(", ")}`);
  if (parsed.soft_preferences.length) {
    lines.push(`prefer: ${parsed.soft_preferences.join(", ")}`);
  }
  if (parsed.exclude_keywords.length) {
    lines.push(`exclude product types: ${parsed.exclude_keywords.join(", ")}`);
  }
  return lines.length ? lines.join("\n") : "none";
}

export async function rankCandidatesWithDeepseek(
  prompt: string,
  parsed: ParsedProductQuery,
  candidates: ProductListItem[],
  limit: number,
): Promise<LlmRankResult> {
  if (!candidates.length) {
    return {
      summary: "No products in the catalog matched your request.",
      rankings: [],
      usage: null,
      source: "fallback",
    };
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return semanticFallbackRank(parsed, candidates, limit, "DEEPSEEK_API_KEY is missing");
  }

  const payload = candidates.map(compactCandidate);
  const user = [
    `Shopper request: ${prompt}`,
    `Parsed intent: ${parsed.explanation}`,
    `Primary product type: ${parsed.product_terms.join(", ") || "any"}`,
    `Hard constraints:\n${constraintsBlock(parsed)}`,
    `Return up to ${limit} rankings.`,
    `Candidates JSON:\n${JSON.stringify(payload)}`,
  ].join("\n\n");

  try {
    const { content, usage } = await deepseekChat({
      maxTokens: 1400,
      timeoutMs: 28_000,
      jsonObject: true,
      system: RANK_SYSTEM,
      user,
    });
    const raw = extractJsonObject(content) as {
      summary?: string;
      rankings?: Array<{
        product_id?: string;
        score?: number;
        reasons?: string[];
        warning?: string | null;
      }>;
    };
    const idSet = new Set(candidates.map((p) => p.id));
    const rankings: LlmRankedItem[] = (raw.rankings ?? [])
      .filter((r) => r.product_id && idSet.has(r.product_id))
      .map((r) => ({
        product_id: r.product_id!,
        score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
        reasons: Array.isArray(r.reasons)
          ? r.reasons.map(String).filter(Boolean).slice(0, 3)
          : ["Good match"],
        warning: r.warning ?? null,
      }))
      .slice(0, limit);

    return {
      summary:
        typeof raw.summary === "string" && raw.summary.trim()
          ? raw.summary.trim().slice(0, 200)
          : parsed.explanation,
      rankings,
      usage,
      source: "deepseek",
    };
  } catch (error) {
    return semanticFallbackRank(parsed, candidates, limit, (error as Error).message);
  }
}

function semanticFallbackRank(
  parsed: ParsedProductQuery,
  candidates: ProductListItem[],
  limit: number,
  warning: string,
): LlmRankResult {
  const { rankings, summary, relaxed } = rankCandidatesSemantically(candidates, parsed, limit);
  return {
    summary: relaxed ? summary : parsed.explanation,
    rankings,
    usage: null,
    source: "fallback",
    warning,
  };
}

#!/usr/bin/env -S pnpm tsx
/**
 * Pipeline funnel — Blinkit products through scrape → PDP → nutrition → OCR → score.
 *
 *   pnpm funnel
 */

import { config } from "dotenv";
import { isPlatformNutritionComplete, nutritionIsSparse } from "@/lib/nutrition/completeness";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductNutrition } from "@/lib/supabase/types";

config({ path: ".env.local" });

type CountQuery = PromiseLike<{
  count: number | null;
  error: { message: string; code?: string } | null;
}>;

async function safeCount(label: string, q: CountQuery): Promise<number | null> {
  try {
    const { count, error } = await q;
    if (error) {
      console.error(`[funnel] ${label}:`, error.message || error.code || error);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.error(`[funnel] ${label}:`, (e as Error).message);
    return null;
  }
}

async function main() {
  const s = adminClient();
  const p = () =>
    s.from("products").select("*", { count: "exact", head: true }).eq("platform", "blinkit");

  const sparseSample = await countSparseNutrition(s, 5000);

  const metrics: Record<string, number | null> = {
    total: await safeCount("total", p()),
    listingOnly: await safeCount("listingOnly", p().is("raw_payload", null)),
    withDetail: await safeCount("withDetail", p().not("raw_payload", "is", null)),
    pendingDetail: await safeCount("pendingDetail", p().is("raw_payload", null)),
    withNutrition: await safeCount("withNutrition", p().not("nutrition", "is", null)),
    withIngredients: await safeCount("withIngredients", p().not("ingredients_raw", "is", null)),
    detailNoNutrition: await safeCount(
      "detailNoNutrition",
      p().not("raw_payload", "is", null).is("nutrition", null),
    ),
    scoredRows: await safeCount(
      "scoredRows",
      s.from("core_scores").select("*", { count: "exact", head: true }),
    ),
    ocrPending: await safeCount("ocrPending", p().eq("ocr_status", "pending")),
    ocrSuccess: await safeCount("ocrSuccess", p().eq("ocr_status", "success")),
    ocrNoLabel: await safeCount("ocrNoLabel", p().eq("ocr_status", "no_label_found")),
    ocrFailed: await safeCount("ocrFailed", p().eq("ocr_status", "failed")),
    ocrPendingOnPdp: await safeCount(
      "ocrPendingOnPdp",
      p().not("raw_payload", "is", null).eq("ocr_status", "pending"),
    ),
    ocrSuccessOnPdp: await safeCount(
      "ocrSuccessOnPdp",
      p().not("raw_payload", "is", null).eq("ocr_status", "success"),
    ),
    nutritionCompleteSample: sparseSample.complete,
    nutritionSparseSample: sparseSample.sparse,
    llmTextSourceSample: sparseSample.llmText,
  };

  const T = metrics.total ?? 0;
  const withNutrition = metrics.withNutrition ?? 0;
  const scoredRows = metrics.scoredRows ?? 0;
  const withDetail = metrics.withDetail ?? 0;

  let nutritionUnscored: number | null = null;
  try {
    nutritionUnscored = await countNutritionUnscored(s);
  } catch {
    nutritionUnscored =
      withNutrition > 0 && scoredRows > 0
        ? Math.max(0, withNutrition - scoredRows)
        : null;
  }

  const funnel = {
    platform: "blinkit",
    note: "null = count timed out on Supabase; re-run or check indexes",
    metrics,
    funnel: [
      { step: "1 · Listed in DB", n: T, pct: pct(T, T) },
      {
        step: "2 · PDP scraped (raw_payload)",
        n: metrics.withDetail,
        pct: pct(metrics.withDetail, T),
        waiting: metrics.pendingDetail,
      },
      {
        step: "3 · Has nutrition",
        n: metrics.withNutrition,
        pct: pct(metrics.withNutrition, T),
        pdpStillMissing: metrics.detailNoNutrition,
      },
      {
        step: "4 · Has ingredients",
        n: metrics.withIngredients,
        pct: pct(metrics.withIngredients, T),
      },
      {
        step: "4b · Nutrition complete (sample)",
        n: metrics.nutritionCompleteSample,
        pct: pct(metrics.nutritionCompleteSample, sparseSample.sampled),
        note: `sampled ${sparseSample.sampled} PDP rows`,
        sparse: metrics.nutritionSparseSample,
        llm_text: metrics.llmTextSourceSample,
      },
      {
        step: "5 · Core scored",
        n: metrics.scoredRows,
        pct: pct(metrics.scoredRows, T),
        backlog: nutritionUnscored,
      },
    ],
    ocr: {
      allBlinkit: {
        pending: metrics.ocrPending,
        success: metrics.ocrSuccess,
        no_label_found: metrics.ocrNoLabel,
        failed: metrics.ocrFailed,
      },
      pdpCohort: {
        size: withDetail,
        pending: metrics.ocrPendingOnPdp,
        success: metrics.ocrSuccessOnPdp,
        donePct: pct(metrics.ocrSuccessOnPdp, withDetail),
      },
    },
    gaps: {
      listingOnly: metrics.listingOnly,
      pendingDetail: metrics.pendingDetail,
      detailWithoutNutrition: metrics.detailNoNutrition,
      hasNutritionNotScored: nutritionUnscored,
    },
    commands: {
      scoreBacklog: "pnpm score -- --only-unscored",
      ocrBacklog: "pnpm ocr -- --with-detail",
      nutritionPipeline: "pnpm export:nutrition:priority && pnpm nutrition:pipeline",
    },
  };

  console.log(JSON.stringify(funnel, null, 2));
}

function pct(n: number | null, d: number | null): number | null {
  if (n == null || d == null || !d) return null;
  return Math.round((n / d) * 1000) / 10;
}

async function countSparseNutrition(
  s: ReturnType<typeof adminClient>,
  maxRows: number,
): Promise<{ sampled: number; complete: number; sparse: number; llmText: number }> {
  let complete = 0;
  let sparse = 0;
  let llmText = 0;
  let sampled = 0;
  let offset = 0;
  const page = 100;
  while (sampled < maxRows) {
    const { data, error } = await s
      .from("products")
      .select("nutrition, ingredients_raw")
      .eq("platform", "blinkit")
      .not("raw_payload", "is", null)
      .range(offset, offset + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      sampled++;
      const n = row.nutrition as ProductNutrition | null;
      if (n?.source === "llm_text") llmText++;
      if (isPlatformNutritionComplete(row.ingredients_raw as string | null, n)) complete++;
      else if (nutritionIsSparse(n)) sparse++;
      if (sampled >= maxRows) break;
    }
    if (data.length < page) break;
    offset += page;
  }
  return { sampled, complete, sparse, llmText };
}

async function countNutritionUnscored(s: ReturnType<typeof adminClient>): Promise<number> {
  let unscored = 0;
  const page = 500;
  let from = 0;
  for (;;) {
    const { data: products, error: pe } = await s
      .from("products")
      .select("id")
      .eq("platform", "blinkit")
      .not("nutrition", "is", null)
      .range(from, from + page - 1);
    if (pe) throw pe;
    if (!products?.length) break;
    const ids = products.map((r) => r.id);
    const { data: scores, error: se } = await s
      .from("core_scores")
      .select("product_id")
      .in("product_id", ids);
    if (se) throw se;
    const scoredSet = new Set((scores ?? []).map((r) => r.product_id));
    unscored += ids.filter((id) => !scoredSet.has(id)).length;
    if (products.length < page) break;
    from += page;
  }
  return unscored;
}

main();

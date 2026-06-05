import { NextRequest, NextResponse } from "next/server";
import { parseIngredientsForDisplayWithIntelligence } from "@/lib/ingredients/display-from-intelligence";
import { loadIngredientIntelligenceForDisplay } from "@/lib/ingredients/load-intelligence";
import { detectNutritionAnomalies } from "@/lib/nutrition/anomaly";
import { reconcileNutritionWithLlm } from "@/lib/nutrition/sanity";
import { resolveNutritionDisplay } from "@/lib/nutrition/nutrition-display";
import { reconcileDisplayIngredients } from "@/lib/ocr/deepseek-ingredients";
import { deepseekDisplayFromPayload } from "@/lib/ocr/deepseek-promote";
import { findAlternatives, findSimilarProducts } from "@/lib/products/alternatives";
import { explainScore } from "@/lib/products/score-explain";
import { displayPriceInr } from "@/lib/products/display-price";
import { getProductBySlug, getProductsForSwaps } from "@/lib/products/queries";
import { resolveZeptoBuyUrl } from "@/lib/products/zepto-product-url";
import { goalFromParam } from "@/lib/goals/types";
import { resolveProductVerdict } from "@/lib/scoring/verdict-resolve";
import type { SubScores } from "@/lib/supabase/types";

export const revalidate = 120;

function mapSwap(s: {
  product: {
    slug: string;
    name: string;
    brand: string | null;
    image_urls: string[];
    core_scores: { score: number; grade: string } | null;
    price_inr: number | null;
  };
  goalFit: number;
  deltas: string[];
}) {
  return {
    slug: s.product.slug,
    name: s.product.name,
    brand: s.product.brand,
    image: s.product.image_urls[0] ?? null,
    score: s.product.core_scores?.score ?? null,
    grade: s.product.core_scores?.grade ?? null,
    price_inr: displayPriceInr(s.product) ?? s.product.price_inr,
    goal_fit: s.goalFit,
    deltas: s.deltas,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const goal = goalFromParam(request.nextUrl.searchParams.get("goal") ?? undefined);
  const product = await getProductBySlug(slug);
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const score = product.core_scores;
  const verdict = score
    ? resolveProductVerdict({
        verdict: score.verdict,
        score: score.absolute_score ?? score.score,
        name: product.name,
        category: product.category,
        subcategory: product.subcategory,
        hazardous: Boolean(
          (score.breakdown as { hard_capped?: boolean } | null)?.hard_capped,
        ),
      })
    : null;

  const displayNutrition = await reconcileNutritionWithLlm(
    {
      nutrition: product.nutrition,
      attributes: product.attributes,
      name: product.name,
      category: product.category,
      subcategory: product.subcategory,
      net_weight: product.net_weight,
    },
    `nutrition:${product.id}`, // LLM result cache key
  );

  const nutritionCtx = displayNutrition
    ? {
        name: product.name,
        category: product.category,
        subcategory: product.subcategory,
      }
    : null;

  const nutritionDisplay = displayNutrition
    ? resolveNutritionDisplay(displayNutrition, product.net_weight)
    : null;

  const nutritionAnomalies =
    displayNutrition && nutritionCtx
      ? detectNutritionAnomalies(displayNutrition, nutritionCtx)
      : [];

  const subscores = score?.subscores as SubScores | undefined;
  const scoreWhy = score
    ? explainScore({
        score: score.score,
        band: score.band,
        subscores,
        concerns: score.concerns,
        breakdown: score.breakdown,
        nutrition: displayNutrition,
        ingredients_raw: product.ingredients_raw,
        productName: product.name,
        category: product.category,
        subcategory: product.subcategory,
        role_cohort: score.role_cohort,
      })
    : null;

  const displayIngredients = reconcileDisplayIngredients({
    ingredients_raw: product.ingredients_raw,
    ocr_payload: product.ocr_payload,
    productName: product.name,
  });

  const intelligenceRows = await loadIngredientIntelligenceForDisplay(displayIngredients);
  const ingredientItems = parseIngredientsForDisplayWithIntelligence(
    displayIngredients,
    intelligenceRows,
  ).map((item) => ({
    display: item.display,
    risk: item.risk,
    tier_label: item.tierLabel,
    why: item.why ?? null,
    e_number: item.eNumber ?? null,
    percent: item.percent ?? null,
    flagged: item.flagged,
    source: item.source,
  }));

  const deepseek = deepseekDisplayFromPayload(product.ocr_payload);

  const swapPool = await getProductsForSwaps(product, 180);
  const swaps = findAlternatives(product, swapPool, goal, 3, {}).map(mapSwap);
  const similar = findSimilarProducts(product, swapPool, goal, 8, {
    excludeIds: new Set(swaps.map((s) => s.slug)),
  }).map(mapSwap);

  const zepto_buy_url = resolveZeptoBuyUrl(product);

  return NextResponse.json(
    {
      ...product,
      zepto_buy_url,
      ingredients_raw: displayIngredients,
      nutrition: displayNutrition,
      verdict_resolved: verdict,
      deepseek_why: deepseek?.why ?? null,
      deepseek_chips: deepseek?.chips ?? [],
      score_why: scoreWhy,
      nutrition_display: nutritionDisplay,
      nutrition_anomalies: nutritionAnomalies,
      ingredient_items: ingredientItems,
      swaps,
      similar_products: similar,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    },
  );
}

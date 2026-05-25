import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnalysisGrid } from "@/components/analysis-grid";
import { IngredientPanel } from "@/components/ingredient-panel";
import { NutritionTable } from "@/components/nutrition-table";
import { ProteinQualityNote } from "@/components/protein-quality-note";
import { reconcileNutrition } from "@/lib/nutrition/sanity";
import { ProductGallery } from "@/components/product-gallery";
import { ProductGoalFitList } from "@/components/product-goal-fit-list";
import { ProductGoalToolbar } from "@/components/product-goal-toolbar";
import { ScorePending, ScoreSubscoresBlock } from "@/components/score-display";
import { ScoreWhyPanel } from "@/components/score-why-panel";
import { SwapPanel } from "@/components/swap-panel";
import { buildOverallGoalSummary, buildProductGoalRows } from "@/lib/goals/build-goal-rows";
import { goalFromParam } from "@/lib/goals/types";
import { dietFromParam } from "@/lib/diet/types";
import { productDietBadge } from "@/lib/diet/match";
import { DietBadgeRow } from "@/components/diet-badge";
import { explainScore } from "@/lib/products/score-explain";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { buildAnalysisHighlights } from "@/lib/products/analysis";
import { findAlternatives } from "@/lib/products/alternatives";
import { getProductBySlug, getProductsForSwaps } from "@/lib/products/queries";
import { matchAdditives } from "@/lib/scoring/rules";
import type { SubScores } from "@/lib/supabase/types";

export const revalidate = 60;

const DETAIL_SKIP = new Set([
  "Description",
  "Key Features",
  "Disclaimer",
  "Return Policy",
  "Customer Care Details",
  "Seller",
  "Seller FSSAI",
  "FSSAI License",
]);

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ goal?: string; diet?: string }>;
}) {
  const { slug } = await params;
  const { goal: goalParam, diet: dietParam } = await searchParams;
  const goal = goalFromParam(goalParam);
  const diet = dietFromParam(dietParam);
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const displayNutrition = reconcileNutrition({
    nutrition: product.nutrition,
    attributes: product.attributes,
    name: product.name,
    category: product.category,
    net_weight: product.net_weight,
  });
  const productForGoals = displayNutrition ? { ...product, nutrition: displayNutrition } : product;

  const swapPool = await getProductsForSwaps(product, 200);
  const swaps = findAlternatives(product, swapPool, goal, 3, { diet });
  const goalRows = buildProductGoalRows(productForGoals);
  const overallGoal = buildOverallGoalSummary(productForGoals);
  const dietBadge = productDietBadge(product);

  const score = product.core_scores;
  const subscores = score?.subscores as SubScores | undefined;
  const attrs = product.attributes ?? {};
  const attrEntries = Object.entries(attrs).filter(([k]) => !DETAIL_SKIP.has(k));
  const highlights = buildAnalysisHighlights(
    product.nutrition,
    product.ingredients_raw,
    subscores,
    4,
  );

  const scoreWhy = score
    ? explainScore({
        score: score.score,
        band: score.band,
        subscores,
        concerns: score.concerns,
        breakdown: score.breakdown,
        nutrition: product.nutrition,
        ingredients_raw: product.ingredients_raw,
        productName: product.name,
      })
    : null;

  return (
    <main className="min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-6xl px-6 pb-20 pt-8">
        <Link
          href="/search"
          className="text-sm text-(--color-fg-muted) hover:text-(--color-fg)"
        >
          ← Catalog
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14 lg:items-start">
          <div className="space-y-6">
            <ProductGallery images={product.image_urls} alt={product.name} />

            {score ? (
              <ScoreSubscoresBlock
                subscores={subscores}
                flaggedAdditiveCount={matchAdditives(product.ingredients_raw).filter(
                  (m) => m.tier === "moderate" || m.tier === "hazardous",
                ).length}
              />
            ) : (
              <ScorePending compact />
            )}

            <SwapPanel current={product} suggestions={swaps} compact goal={goal} />
          </div>

          <div className="min-w-0">
            {product.brand ? (
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-(--color-fg-dim)">
                {product.brand}
              </p>
            ) : null}
            <h1 className="font-display mt-2 text-balance text-3xl leading-tight md:text-4xl">
              {product.name}
            </h1>
            <p className="mt-2 text-sm text-(--color-fg-muted)">
              {[product.category, product.subcategory].filter(Boolean).join(" · ")}
              {product.net_weight ? ` · ${product.net_weight}` : ""}
            </p>
            <DietBadgeRow badge={dietBadge} selected={diet} />
            {product.price_inr != null ? (
              <p className="mt-4 text-2xl font-semibold tabular-nums">
                ₹{product.price_inr}
                {product.mrp_inr != null && product.mrp_inr > product.price_inr ? (
                  <span className="ml-2 text-base font-normal text-(--color-fg-dim) line-through">
                    ₹{product.mrp_inr}
                  </span>
                ) : null}
              </p>
            ) : null}
            <ProductGoalToolbar slug={product.slug} name={product.name} />
            <Suspense fallback={null}>
              <ProductGoalFitList
                rows={goalRows}
                overall={overallGoal}
                scoreReasons={scoreWhy?.reasons}
              />
            </Suspense>
          </div>
        </div>

        {scoreWhy ? (
          <div className="mt-8">
            <ScoreWhyPanel explanation={scoreWhy} />
          </div>
        ) : null}

        <div className="mt-8 space-y-8">
          {highlights.length > 0 ? (
            <section>
              <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-(--color-fg-dim)">
                Quick analysis
              </h2>
              <div className="mt-4">
                <AnalysisGrid highlights={highlights} />
              </div>
            </section>
          ) : null}
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:items-start">
          <section>
            <h2 className="font-display text-2xl">Ingredients</h2>
            <p className="mt-2 text-[15px] text-(--color-fg-muted)">
              Flagged additives highlighted — tap a row for detail.
            </p>
            <div className="mt-5">
              <IngredientPanel ingredientsRaw={product.ingredients_raw} />
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl">Nutrition</h2>
            <p className="mt-2 text-sm text-(--color-fg-muted)">Per 100g from label or platform.</p>
            <div className="mt-5">
              {displayNutrition ? (
                <>
                  <NutritionTable nutrition={displayNutrition} netWeight={product.net_weight} />
                  <ProteinQualityNote
                    nutrition={displayNutrition}
                    name={product.name}
                    category={product.category}
                  />
                </>
              ) : (
                <p className="text-sm text-(--color-fg-muted)">Not available yet.</p>
              )}
            </div>
          </section>
        </div>

        {attrEntries.length > 0 ? (
          <section className="mt-12">
            <h2 className="font-display text-2xl">Details</h2>
            <dl className="mt-5 grid gap-2 sm:grid-cols-2">
              {attrEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl bg-(--color-bg-soft) px-4 py-3 ring-1 ring-(--color-line)"
                >
                  <dt className="text-[10px] uppercase tracking-wider text-(--color-fg-dim)">
                    {key}
                  </dt>
                  <dd className="mt-1 text-sm text-(--color-fg)">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>

      <SiteFooter />
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AnalysisGrid } from "@/components/analysis-grid";
import { IngredientPanel } from "@/components/ingredient-panel";
import { NutritionTable } from "@/components/nutrition-table";
import { ProductGallery } from "@/components/product-gallery";
import { ProductGoalToolbar } from "@/components/product-goal-toolbar";
import { GoalFitChip, ScorePanel, ScorePending } from "@/components/score-display";
import { ScoreWhyPanel } from "@/components/score-why-panel";
import { SwapPanel } from "@/components/swap-panel";
import { explainScore } from "@/lib/products/score-explain";
import { GOAL_PROFILES } from "@/lib/goals/types";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { computeGoalFit, goalFitInputs } from "@/lib/goals/fit";
import { goalFromParam } from "@/lib/goals/types";
import { buildAnalysisHighlights } from "@/lib/products/analysis";
import { findAlternatives } from "@/lib/products/alternatives";
import { getProductBySlug, getProductsForSwaps } from "@/lib/products/queries";
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
  searchParams: Promise<{ goal?: string }>;
}) {
  const { slug } = await params;
  const { goal: goalParam } = await searchParams;
  const goal = goalFromParam(goalParam);
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const swapPool = await getProductsForSwaps(product, 200);
  const swaps = findAlternatives(product, swapPool, goal, 3);
  const goalFit =
    goal !== "balanced"
      ? computeGoalFit(goal, goalFitInputs(product))
      : null;

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

  const goalProfile = GOAL_PROFILES.find((g) => g.id === goal);

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

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
          <ProductGallery images={product.image_urls} alt={product.name} />

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
            <Suspense fallback={null}>
              <ProductGoalToolbar slug={product.slug} name={product.name} />
            </Suspense>
            {goalFit && goal !== "balanced" ? (
              <div className="mt-4 space-y-2">
                <GoalFitChip fit={goalFit.fit} label={goalProfile?.short ?? "Your goal"} />
                <p className="text-[15px] leading-relaxed text-(--color-fg-muted)">
                  {goalFit.reasons.join(" · ")}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2 lg:items-start">
          {score ? (
            <ScorePanel
              score={score.score}
              grade={score.grade}
              band={score.band}
              subscores={subscores}
              ruleVersion={score.rule_version}
              compact
            />
          ) : (
            <ScorePending compact />
          )}
          <SwapPanel current={product} suggestions={swaps} compact goal={goal} />
        </div>

        {scoreWhy ? (
          <div className="mt-6">
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
              {product.nutrition ? (
                <NutritionTable nutrition={product.nutrition} />
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

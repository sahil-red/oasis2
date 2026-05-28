import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IngredientPanel } from "@/components/ingredient-panel";
import { NutritionTable } from "@/components/nutrition-table";
import { ProteinQualityNote } from "@/components/protein-quality-note";
import { reconcileNutrition } from "@/lib/nutrition/sanity";
import { ProductGallery } from "@/components/product-gallery";
import { ProductGoalFitList } from "@/components/product-goal-fit-list";
import { ProductGoalToolbar } from "@/components/product-goal-toolbar";
import { SwapPanel } from "@/components/swap-panel";
import { buildOverallGoalSummary, buildProductGoalRows } from "@/lib/goals/build-goal-rows";
import { goalFromParam } from "@/lib/goals/types";
import { dietFromParam } from "@/lib/diet/types";
import { productDietBadge } from "@/lib/diet/match";
import { DietBadgeRow } from "@/components/diet-badge";
import { explainScore } from "@/lib/products/score-explain";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { DataProvenancePanel } from "@/components/data-provenance-panel";
import { LabelChangeSummary } from "@/components/label-change-summary";
import { VerdictBlock } from "@/components/verdict-chips";
import { resolveProductVerdict } from "@/lib/scoring/verdict-resolve";
import { labelResolutionFromPayload } from "@/lib/products/label-resolution";
import { CatalogBackLink } from "@/components/catalog-back-link";
import { perServeFromNutrition } from "@/lib/scoring/per-serve";
import { buildProductProvenance } from "@/lib/products/data-provenance";
import { loadIngredientIntelligenceForDisplay } from "@/lib/ingredients/load-intelligence";
import { findAlternatives } from "@/lib/products/alternatives";
import { getProductBySlug, getProductsForSwaps } from "@/lib/products/queries";
import { displayPriceInr, showMrpStrike } from "@/lib/products/display-price";
import type { SubScores } from "@/lib/supabase/types";

export const revalidate = 300;

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
  searchParams: Promise<{
    goal?: string;
    diet?: string;
    q?: string;
    category?: string;
    subcategory?: string;
    usecase?: string;
    brand?: string;
    scored?: string;
    min?: string;
    maxprice?: string;
    grade?: string;
    sort?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { goal: goalParam, diet: dietParam } = sp;
  const goal = goalFromParam(goalParam);
  const diet = dietFromParam(dietParam);
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const price = displayPriceInr(product);

  const displayNutrition = reconcileNutrition({
    nutrition: product.nutrition,
    attributes: product.attributes,
    name: product.name,
    category: product.category,
    subcategory: product.subcategory,
    net_weight: product.net_weight,
  });
  const productForGoals = displayNutrition ? { ...product, nutrition: displayNutrition } : product;

  const swapPool = await getProductsForSwaps(product, 96);
  const swaps = findAlternatives(product, swapPool, goal, 3, { diet });
  const goalRows = buildProductGoalRows(productForGoals);
  const overallGoal = buildOverallGoalSummary(productForGoals);
  const dietBadge = productDietBadge(product);

  const score = product.core_scores;
  const subscores = score?.subscores as SubScores | undefined;
  const attrs = product.attributes ?? {};
  const attrEntries = Object.entries(attrs).filter(([k]) => !DETAIL_SKIP.has(k));
  const perServeMeta = displayNutrition ? perServeFromNutrition(displayNutrition) : null;
  const hasServing = perServeMeta?.serving_g != null && perServeMeta.serving_g > 0;

  const labelResolution = labelResolutionFromPayload(product.ocr_payload);
  const ingredientIntelligence = await loadIngredientIntelligenceForDisplay(
    product.ingredients_raw,
  );
  const provenance = buildProductProvenance({
    nutrition: product.nutrition,
    ingredients_raw: product.ingredients_raw,
    platform: product.platform,
    data_source: product.data_source,
    ocr_status: product.ocr_status,
    ocr_payload: product.ocr_payload,
  });

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
        category: product.category,
        subcategory: product.subcategory,
        role_cohort: score.role_cohort,
      })
    : null;

  return (
    <main className="min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-6xl px-6 pb-24 pt-6">
        <CatalogBackLink params={sp} />

        {/* ── Hero: image + name + verdict ─────────────────────────── */}
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14 lg:items-start">
          <div className="space-y-6">
            <ProductGallery images={product.image_urls} alt={product.name} />
            <SwapPanel current={product} suggestions={swaps} compact goal={goal} />
          </div>

          <div className="min-w-0">
            {product.brand ? (
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-(--color-fg-dim)">
                {product.brand}
              </p>
            ) : null}
            <h1 className="font-display mt-2 text-balance text-3xl leading-[1.05] md:text-[2.5rem]">
              {product.name}
            </h1>
            <p className="mt-2 text-sm text-(--color-fg-muted)">
              {[product.category, product.subcategory, product.l3_category]
                .filter(Boolean)
                .join(" · ")}
              {product.net_weight ? ` · ${product.net_weight}` : ""}
            </p>
            <DietBadgeRow badge={dietBadge} selected={diet} />
            {price != null ? (
              <p className="mt-4 text-2xl font-semibold tabular-nums">
                ₹{price}
                {showMrpStrike(product) ? (
                  <span className="ml-2 text-base font-normal text-(--color-fg-dim) line-through">
                    ₹{product.mrp_inr}
                  </span>
                ) : null}
              </p>
            ) : null}
            <ProductGoalToolbar slug={product.slug} name={product.name} />

            {verdict ? (
              <div className="mt-5">
                <VerdictBlock
                  verdict={verdict}
                  sublabelIds={score?.verdict_sublabels}
                  cohortSize={score?.cohort_size}
                  relativeScore={score?.relative_score}
                  cohortId={score?.cohort_id ?? null}
                  subcategory={product.subcategory}
                  productId={product.id}
                />
              </div>
            ) : null}

            {/* "Why" prose — short, opinionated, no math */}
            {scoreWhy && scoreWhy.reasons.length > 0 ? (
              <section className="mt-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-(--color-fg-dim)">
                  Why
                </p>
                <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-(--color-fg)">
                  {scoreWhy.reasons.slice(0, 4).map((r, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-(--color-fg-dim)"
                        aria-hidden
                      />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <Suspense fallback={null}>
              <ProductGoalFitList
                rows={goalRows}
                overall={overallGoal}
                scoreReasons={scoreWhy?.reasons}
                inPractice={scoreWhy}
                scoreSublabelIds={score?.verdict_sublabels}
                scoreVerdict={verdict}
                scoreSubscores={subscores}
              />
            </Suspense>
          </div>
        </div>

        {labelResolution ? (
          <div className="mt-12">
            <LabelChangeSummary labelResolution={labelResolution} />
          </div>
        ) : null}

        {/* ── Ingredients + Nutrition (the data) ─────────────────────── */}
        <div className="mt-14 grid gap-12 lg:grid-cols-2 lg:items-start">
          <section>
            <h2 className="font-display text-2xl">Ingredients</h2>
            <p className="mt-1.5 text-[13px] text-(--color-fg-muted)">
              Tap any flagged ingredient for the why behind it.
            </p>
            <div className="mt-5">
              <IngredientPanel
                ingredientsRaw={product.ingredients_raw}
                intelligenceRows={ingredientIntelligence}
              />
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl">Nutrition</h2>
            <p className="mt-1.5 text-[13px] text-(--color-fg-muted)">
              {hasServing
                ? `Per serve and per 100g — toggle below.`
                : `Per 100g from the back label.`}
            </p>
            <div className="mt-5">
              {displayNutrition ? (
                <>
                  <NutritionTable
                    nutrition={displayNutrition}
                    netWeight={product.net_weight}
                    name={product.name}
                    category={product.category}
                    subcategory={product.subcategory}
                  />
                  <ProteinQualityNote
                    nutrition={displayNutrition}
                    name={product.name}
                    category={product.category}
                  />
                </>
              ) : (
                <p className="text-sm text-(--color-fg-muted)">
                  Not on the label yet — back labels are still being scanned.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* ── Quiet footer: details + provenance ─────────────────────── */}
        {(attrEntries.length > 0 || provenance) ? (
          <details className="mt-16 border-t border-(--color-line) pt-8 group">
            <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.2em] text-(--color-fg-dim) hover:text-(--color-fg)">
              Where this data came from + product details
            </summary>
            <div className="mt-6 space-y-10">
              {attrEntries.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-(--color-fg)">Pack details</h3>
                  <dl className="mt-4 grid gap-2 sm:grid-cols-2">
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

              {provenance ? (
                <section>
                  <h3 className="text-sm font-semibold text-(--color-fg)">Data sources</h3>
                  <div className="mt-4">
                    <DataProvenancePanel provenance={provenance} />
                  </div>
                </section>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>

      <SiteFooter />
    </main>
  );
}

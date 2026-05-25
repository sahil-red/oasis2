import Link from "next/link";
import { notFound } from "next/navigation";
import { AnalysisGrid } from "@/components/analysis-grid";
import { IngredientPanel } from "@/components/ingredient-panel";
import { NutritionTable } from "@/components/nutrition-table";
import { ProductGallery } from "@/components/product-gallery";
import { ScorePanel, ScorePending } from "@/components/score-display";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { buildAnalysisHighlights } from "@/lib/products/analysis";
import { getProductBySlug } from "@/lib/products/queries";
import type { SubScores } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

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
          </div>
        </div>

        <div className="mt-10 space-y-8">
          {score ? (
            <ScorePanel
              score={score.score}
              grade={score.grade}
              band={score.band}
              subscores={subscores}
              ruleVersion={score.rule_version}
            />
          ) : (
            <ScorePending />
          )}

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
            <p className="mt-2 text-sm text-(--color-fg-muted)">
              Risk tier per ingredient · tap flagged rows for detail.
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

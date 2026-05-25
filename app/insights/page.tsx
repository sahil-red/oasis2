import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { InsightProductCard } from "@/components/insight-product-card";
import {
  InsightsCarouselSlide,
  InsightsProductCarousel,
} from "@/components/insights-product-carousel";
import { InsightsBrandBoard } from "@/components/insights-brand-board";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getCachedCatalog } from "@/lib/products/catalog-cache";
import {
  marketingCallout,
  proteinPerRupeeLine,
  proteinValueBlurb,
  snackBlurb,
} from "@/lib/products/insight-copy";
import { buildInsights } from "@/lib/products/insights";

export const revalidate = 120;

export default async function InsightsPage() {
  const products = await getCachedCatalog();
  const insights = buildInsights(products.filter((p) => p.core_scores));

  return (
    <main className="min-h-screen bg-(--color-bg)">
      <SiteNav />

      <div className="border-b border-(--color-line) bg-gradient-to-br from-violet-50 via-white to-amber-50">
        <div className="mx-auto max-w-6xl px-5 py-12 md:px-6 md:py-16">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
            Catalog intel · evidence-backed
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            Insider grocery intel
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-(--color-fg-muted)">
            Skim in 30 seconds: which &quot;healthy&quot; labels disappoint, where protein
            money actually goes, and which brands consistently deliver on the pack.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-900">
              Marketing callouts
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-900">
              Protein value
            </span>
            <span className="rounded-full bg-violet-100 px-3 py-1 font-medium text-violet-900">
              Snack winners
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-10 md:px-6 md:pt-14">
        <section className="mb-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl md:text-3xl">
                &quot;Healthy&quot; marketing, weak labels
              </h2>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-(--color-fg-muted)">
                Health/protein/zero cues on the front — but the label tells a different story.
              </p>
            </div>
            <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-medium text-white">
              {insights.misleading.length} flagged
            </span>
          </div>
          <div className="mt-6 px-2 sm:px-6">
            <InsightsProductCarousel ariaLabel="Marketing reality check products">
              {insights.misleading.map(({ product }) => {
                const c = marketingCallout(product);
                return (
                  <InsightsCarouselSlide key={product.id}>
                    <InsightProductCard
                      product={product}
                      accent="warn"
                      badge="Callout"
                      headline={c.reality}
                      subline={c.claim}
                    />
                  </InsightsCarouselSlide>
                );
              })}
            </InsightsProductCarousel>
          </div>
        </section>

        <section className="mb-14">
          <h2 className="font-display text-2xl md:text-3xl">Best protein per rupee</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {insights.proteinPerRupee.map(({ product }) => (
              <InsightProductCard
                key={product.id}
                product={product}
                accent="value"
                badge="Value"
                headline={proteinValueBlurb(product)}
                subline={proteinPerRupeeLine(product)}
              />
            ))}
          </div>
        </section>

        <section className="mb-14">
          <h2 className="font-display text-2xl md:text-3xl">High-protein snacks</h2>
          <p className="mt-2 max-w-xl text-[15px] text-(--color-fg-muted)">
            Snacks &amp; munchies with real protein — not just marketing on the bag.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {insights.highProteinSnacks.map(({ product }) => (
              <InsightProductCard
                key={product.id}
                product={product}
                accent="snack"
                headline={snackBlurb(product)}
                subline={`${product.nutrition?.protein_g_100g ?? "—"}g protein / 100g`}
              />
            ))}
          </div>
        </section>

        <section className="mb-14">
          <InsightsBrandBoard
            cleanest={insights.cleanestBrands}
            weakest={insights.weakestBrands}
          />
        </section>

        <div className="rounded-2xl border border-(--color-line) bg-(--color-bg-soft) px-6 py-10 text-center">
          <p className="text-[15px] text-(--color-fg-muted)">
            Want the full picture on one product?
          </p>
          <Link
            href="/search"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-(--color-fg) px-5 py-2.5 text-sm font-medium text-(--color-bg) hover:opacity-90"
          >
            Browse catalog
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}

import Link from "next/link";
import { InsightProductList } from "@/components/insight-product-list";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { buildInsights } from "@/lib/products/insights";
import { getAllCatalogProducts } from "@/lib/products/queries";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const products = await getAllCatalogProducts({ onlyWithDetail: true });
  const insights = buildInsights(products.filter((p) => p.core_scores));

  return (
    <main className="min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <header className="max-w-2xl">
          <h1 className="font-display text-4xl leading-tight">Insights</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-(--color-fg-muted)">
            Brand patterns and Indian grocery rankings from our Blinkit catalog — built to
            expose misleading “healthy” marketing, not to judge what you eat.
          </p>
        </header>

        <div className="mt-12 grid gap-12 lg:grid-cols-2">
          <section>
            <h2 className="font-display text-2xl">Cleanest brands</h2>
            <p className="mt-2 text-sm text-(--color-fg-muted)">
              Avg Core score · 3+ scored SKUs in catalog.
            </p>
            <ol className="mt-4 space-y-2">
              {insights.cleanestBrands.map((b, i) => (
                <li
                  key={b.brand}
                  className="flex items-baseline justify-between rounded-lg border border-(--color-line) bg-white px-4 py-3"
                >
                  <span className="text-sm font-medium">
                    {i + 1}. {b.brand}
                  </span>
                  <span className="text-sm tabular-nums text-(--color-fg-muted)">
                    {b.avgScore.toFixed(0)} · {b.count} items
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h2 className="font-display text-2xl">Weakest averages</h2>
            <p className="mt-2 text-sm text-(--color-fg-muted)">
              Brands with the lowest typical scores in our data.
            </p>
            <ol className="mt-4 space-y-2">
              {insights.weakestBrands.map((b, i) => (
                <li
                  key={b.brand}
                  className="flex items-baseline justify-between rounded-lg border border-(--color-line) bg-white px-4 py-3"
                >
                  <span className="text-sm font-medium">
                    {i + 1}. {b.brand}
                  </span>
                  <span className="text-sm tabular-nums text-(--color-fg-muted)">
                    {b.avgScore.toFixed(0)} avg
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section className="mt-14">
          <h2 className="font-display text-2xl">“Healthy” marketing, weak labels</h2>
          <p className="mt-2 max-w-2xl text-sm text-(--color-fg-muted)">
            Products with health/protein/zero cues in the name but low scores or high sugar —
            shareable, evidence-backed callouts.
          </p>
          <div className="mt-5">
            <InsightProductList
              products={insights.misleading}
              meta={(p) => {
                const s = p.nutrition?.sugar_g_100g ?? p.nutrition?.added_sugar_g_100g;
                return s != null ? `${s}g sugar / 100g` : p.brand;
              }}
            />
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-2xl">Protein per rupee</h2>
          <p className="mt-2 text-sm text-(--color-fg-muted)">
            Indian-first value metric — grams of protein per ₹100 spent (label-based).
          </p>
          <div className="mt-5">
            <InsightProductList
              products={insights.proteinPerRupee}
              meta={(p) => {
                const protein = p.nutrition?.protein_g_100g ?? 0;
                const price = p.price_inr ?? 0;
                const ppr = price > 0 ? ((protein / price) * 100).toFixed(1) : "—";
                return `~${ppr}g protein / ₹100 · ₹${price}`;
              }}
            />
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-2xl">High-protein snacks</h2>
          <p className="mt-2 text-sm text-(--color-fg-muted)">
            Snacks & munchies aisle with ≥12g protein / 100g and decent Core score.
          </p>
          <div className="mt-5">
            <InsightProductList
              products={insights.highProteinSnacks}
              meta={(p) => `${p.nutrition?.protein_g_100g ?? "—"}g protein / 100g`}
            />
          </div>
        </section>

        <p className="mt-12 text-center text-sm text-(--color-fg-dim)">
          <Link href="/search" className="text-(--color-accent) hover:underline">
            Browse full catalog →
          </Link>
        </p>
      </div>

      <SiteFooter />
    </main>
  );
}

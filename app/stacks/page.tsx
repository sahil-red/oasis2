import Link from "next/link";
import { InsightProductList } from "@/components/insight-product-list";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { computeGoalFit, goalFitInputs } from "@/lib/goals/fit";
import { getCachedScoredCatalog } from "@/lib/products/catalog-cache";

export const dynamic = "force-dynamic";
export const revalidate = 120;

/** v0 auto-list: high-protein picks under ₹200 */
export default async function StacksPage() {
  const products = await getCachedScoredCatalog();

  const budgetProtein = products
    .filter((p) => (p.price_inr ?? 999) <= 200 && (p.nutrition?.protein_g_100g ?? 0) >= 10)
    .map((p) => ({
      p,
      fit: computeGoalFit("protein-budget", goalFitInputs(p)).fit,
    }))
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 12)
    .map((x) => x.p);

  const officeSnacks = products
    .filter((p) => /snack|munch|biscuit/i.test(p.category ?? ""))
    .map((p) => ({
      p,
      fit: computeGoalFit("kids", goalFitInputs(p)).fit,
    }))
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 10)
    .map((x) => x.p);

  const lowSugar = products
    .filter((p) => {
      const s = p.nutrition?.sugar_g_100g ?? p.nutrition?.added_sugar_g_100g;
      return typeof s === "number" && s <= 6 && (p.core_scores?.score ?? 0) >= 55;
    })
    .sort((a, b) => (b.core_scores?.score ?? 0) - (a.core_scores?.score ?? 0))
    .slice(0, 10);

  return (
    <main className="min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <header className="max-w-2xl">
          <h1 className="font-display text-4xl leading-tight">Suggested stacks</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-(--color-fg-muted)">
            Auto-generated shortlists from today&apos;s catalog — high protein under budget,
            cleaner office snacks, lower-sugar staples. Add any item to{" "}
            <Link href="/basket" className="text-(--color-accent) hover:underline">
              cart analysis
            </Link>
            .
          </p>
        </header>

        <section className="mt-12">
          <h2 className="font-display text-2xl">High protein · under ₹200</h2>
          <div className="mt-4">
            <InsightProductList
              products={budgetProtein}
              meta={(p) => `₹${p.price_inr} · ${p.nutrition?.protein_g_100g ?? "—"}g protein`}
            />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl">Cleaner office munching</h2>
          <div className="mt-4">
            <InsightProductList products={officeSnacks} />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl">Low-sugar staples</h2>
          <div className="mt-4">
            <InsightProductList products={lowSugar} />
          </div>
        </section>
      </div>

      <SiteFooter />
    </main>
  );
}

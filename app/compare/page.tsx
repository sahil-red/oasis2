import type { Metadata } from "next";
import { CompareView } from "@/components/compare-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Compare products · Scout",
  description: "Side-by-side label comparison — scores, nutrition, and signals.",
};

export default function ComparePage() {
  return (
    <main className="min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-5xl px-5 pb-20 pt-8 md:px-6 md:pt-10">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
            Compare
          </p>
          <h1 className="font-display mt-2 text-3xl leading-tight md:text-4xl">
            Label to label.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-(--color-fg-muted)">
            The same products, judged on the same axes — best of the set in green, weakest in red.
          </p>
        </header>

        <div className="mt-8">
          <CompareView />
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnalysisGrid } from "@/components/analysis-grid";
import { ScorePanel } from "@/components/score-display";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Faq } from "@/components/faq";
import { FeatureStep } from "@/components/feature-step";
import { Section, Eyebrow, H2 } from "@/components/section";
import { buildAnalysisHighlights } from "@/lib/products/analysis";
import { getFeaturedSample } from "@/lib/products/queries";
import type { SubScores } from "@/lib/supabase/types";

const FAQ = [
  {
    q: "Where does the data come from?",
    a: "Blinkit product pages supply most nutrition and ingredients. When the platform omits them, we OCR the back label. Additive rules are hand-curated with citations — not a black-box model score.",
  },
  {
    q: "What is the Core score?",
    a: "A 0–100 score built from three visible parts: nutrition (60%), additives (30%), and label signals (10%). Every product page shows the breakdown and the same quick-analysis tags you see on cards in the catalog.",
  },
  {
    q: "Is this lab testing?",
    a: "No. We interpret published labels and regulatory guidance (FSSAI, EFSA, WHO). We do not test products in a lab.",
  },
  {
    q: "Why do scores change?",
    a: "Ingredients and our rule set evolve. We version rules and recompute so you can see what shifted.",
  },
];

export default async function Home() {
  const sample = await getFeaturedSample();
  const subscores = sample?.core_scores?.subscores as SubScores | undefined;
  const highlights = sample
    ? buildAnalysisHighlights(sample.nutrition, sample.ingredients_raw, subscores, 4)
    : [];

  return (
    <main>
      <SiteNav />

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-24">
        <div className="grid items-start gap-14 lg:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
              Indian groceries · open data
            </p>
            <h1 className="font-display mt-4 text-balance text-5xl leading-[0.95] md:text-6xl">
              What&apos;s actually in the{" "}
              <span className="italic text-(--color-accent)">packaging</span>?
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-(--color-fg-muted)">
              Search packaged foods, see additive flags and nutrition at a glance, and
              compare Core scores — the same analysis chips on every catalog card.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/search"
                className="inline-flex items-center gap-2 rounded-lg bg-(--color-fg) px-6 py-3 text-sm font-medium text-(--color-bg) hover:opacity-90"
              >
                Open catalog
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/search?goal=gym"
                className="inline-flex items-center gap-2 rounded-lg border border-(--color-line) bg-white px-5 py-3 text-sm font-medium hover:border-(--color-fg)"
              >
                Gym mode
              </Link>
            </div>
          </div>

          {sample?.core_scores ? (
            <div className="space-y-4">
              <Link href={`/product/${sample.slug}`} className="block transition hover:opacity-95">
                <p className="mb-3 text-[11px] uppercase tracking-wider text-(--color-fg-dim)">
                  Live example · {sample.name.slice(0, 48)}
                  {sample.name.length > 48 ? "…" : ""}
                </p>
                <ScorePanel
                  score={sample.core_scores.score}
                  grade={sample.core_scores.grade}
                  band={sample.core_scores.band}
                  subscores={subscores}
                />
              </Link>
              {highlights.length > 0 ? <AnalysisGrid highlights={highlights} /> : null}
            </div>
          ) : (
            <div className="panel rounded-2xl p-8 text-sm text-(--color-fg-muted)">
              Scored products loading — open the catalog to browse.
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="font-display text-2xl">More than a score</h2>
        <p className="mt-2 max-w-xl text-sm text-(--color-fg-muted)">
          Make grocery decisions easier — swaps, goals, and cart context, not fear.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/search?goal=diabetic", title: "Goal modes", desc: "Gym, diabetic, PCOS, vegan, protein/₹" },
            { href: "/product", title: "Swap engine", desc: "Better picks in the same aisle" },
            { href: "/basket", title: "Cart analysis", desc: "Protein % and sugar averages" },
            { href: "/insights", title: "Brand insights", desc: "Misleading “healthy” labels" },
          ].map((f) => (
            <Link
              key={f.title}
              href={f.href === "/product" ? "/search" : f.href}
              className="rounded-xl border border-(--color-line) bg-white p-4 transition hover:border-(--color-accent)"
            >
              <p className="font-medium">{f.title}</p>
              <p className="mt-1 text-sm text-(--color-fg-muted)">{f.desc}</p>
            </Link>
          ))}
        </div>
        <p className="mt-6 text-sm">
          <Link href="/stacks" className="text-(--color-accent) hover:underline">
            Suggested shopping stacks →
          </Link>
        </p>
      </section>

      <div className="hairline mx-auto max-w-6xl" />

      <Section id="how-it-works">
        <Eyebrow>Method</Eyebrow>
        <H2>Label in → facts out.</H2>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          <FeatureStep
            index={1}
            icon="scan"
            title="Find a product"
            body="Filter by category, brand, or name in the catalog."
            delay={0}
          />
          <FeatureStep
            index={2}
            icon="sparkles"
            title="Read the analysis"
            body="Sugar, sodium, additive flags, and Core subscores on one page."
            delay={80}
          />
          <FeatureStep
            index={3}
            icon="shield"
            title="Compare"
            body="Sort by score and pick a better swap in the same aisle."
            delay={160}
          />
        </div>
      </Section>

      <Section id="faq">
        <Eyebrow>FAQ</Eyebrow>
        <H2>Common questions.</H2>
        <div className="mt-10 max-w-2xl">
          <Faq items={FAQ} />
        </div>
      </Section>

      <SiteFooter />
    </main>
  );
}

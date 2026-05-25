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
    a: "Product pages and label images from our catalog. When nutrition or ingredients are missing, we read the back label with OCR. Scores use clear rules — not a black-box AI rating.",
  },
  {
    q: "What is the score?",
    a: "A 0–100 read on the label: nutrition, flagged additives, and a few label signals. Each product page explains why, plus swaps in the same aisle.",
  },
  {
    q: "Is this lab testing?",
    a: "No. We read what’s printed on the pack and map it to published guidance. We don’t test food in a lab.",
  },
  {
    q: "Why do scores change?",
    a: "When labels or our rules update, we re-score so you can see what moved.",
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
              Indian groceries
            </p>
            <h1 className="font-display mt-4 text-balance text-5xl leading-[0.95] md:text-6xl">
              Buy better in the{" "}
              <span className="italic text-(--color-accent)">same aisle</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-(--color-fg-muted)">
              See what&apos;s in the pack, get a plain score, and find a swap — ranked for gym,
              bulk, low sugar, or whatever you&apos;re optimizing for.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/search"
                className="inline-flex items-center gap-2 rounded-lg bg-(--color-fg) px-6 py-3 text-sm font-medium text-(--color-bg) hover:opacity-90"
              >
                Browse catalog
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/insights"
                className="inline-flex items-center gap-2 rounded-lg border border-(--color-line) bg-white px-5 py-3 text-sm font-medium hover:border-(--color-fg)"
              >
                Fake &quot;healthy&quot; picks
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
        <h2 className="font-display text-2xl">Built for quick decisions</h2>
        <p className="mt-2 max-w-xl text-[15px] text-(--color-fg-muted)">
          Less lecture, more &quot;here&apos;s a better option in the same aisle.&quot;
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/search", title: "Pick your goal", desc: "Gym, bulk, diabetic, protein per ₹" },
            { href: "/search", title: "Same-aisle swaps", desc: "Better score without changing category" },
            { href: "/basket", title: "Rate my cart", desc: "Cart with protein, sugar & swaps" },
            { href: "/insights", title: "Decode marketing", desc: "“Healthy” labels that don’t add up" },
          ].map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="rounded-xl border border-(--color-line) bg-white p-5 transition hover:border-(--color-accent)"
            >
              <p className="font-medium text-(--color-fg)">{f.title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-(--color-fg-muted)">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="hairline mx-auto max-w-6xl" />

      <Section id="how-it-works">
        <Eyebrow>How it works</Eyebrow>
        <H2>Three steps.</H2>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          <FeatureStep
            index={1}
            icon="scan"
            title="Find it"
            body="Search by name, aisle, or brand."
            delay={0}
          />
          <FeatureStep
            index={2}
            icon="sparkles"
            title="Read why"
            body="Short reasons — sugar, protein, additives — no jargon wall."
            delay={80}
          />
          <FeatureStep
            index={3}
            icon="shield"
            title="Swap it"
            body="Open a better pick in the same aisle, add to your cart with +."
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

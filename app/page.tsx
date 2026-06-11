import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { HomeRailCard } from "@/components/home-rail-card";
import { HomeShowcase } from "@/components/home-showcase";
import { LandingIntel } from "@/components/landing-intel";
import { LandingGoalBoards } from "@/components/landing-goal-boards";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { SuggestProductType } from "@/components/suggest-product-type";
import { getCachedLandingInsights } from "@/lib/products/catalog-cache";
import { EMPTY_LANDING_INSIGHTS, type LandingInsights } from "@/lib/products/landing-insights";
import { getHomeShelves } from "@/lib/products/queries";

export const revalidate = 600;

import { SEARCH_PROMPTS } from "@/components/search-prompts";
import { TypewriterInput } from "@/components/typewriter-input";

export default async function Home() {
  const shelves = await getHomeShelves();
  let insights: LandingInsights = EMPTY_LANDING_INSIGHTS;
  try {
    insights = await getCachedLandingInsights();
  } catch (err) {
    console.warn("[home] landing insights skipped:", err);
  }

  // Rotate the featured goal board each hour so it feels fresh each visit
  const hourIndex = Math.floor(Date.now() / 3_600_000);
  const initialGoalIndex = hourIndex % Math.max(1, insights.goalBoards.length);

  // Typewriter starts at a different phrase each day
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const promptStart = dayIndex % SEARCH_PROMPTS.length;

  return (
    <main className="min-h-screen">
      <SiteNav />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="border-b border-(--color-line)">
        <div className="mx-auto max-w-7xl px-6 pt-14 pb-12 md:pt-20">
          <div className="max-w-3xl">
            <p className="text-[10px] md:text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
              Honest grocery intel · India
            </p>
            <h1 className="font-display mt-5 text-balance text-5xl leading-[0.95] md:text-7xl">
              We read the back label{" "}
              <span className="italic text-(--color-accent)">so you don't have to</span>.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-(--color-fg-muted)">
              Ask for what you actually need — low-sugar biscuits, high-protein
              snacks, paneer under ₹150, or kid-friendly foods without
              artificial colours.
            </p>

            <form
              action="/search"
              className="mt-8 flex max-w-2xl flex-col gap-3 rounded-2xl border border-(--color-line) bg-(--color-panel) p-3 sm:flex-row"
            >
              <TypewriterInput
                name="prompt"
                phrases={SEARCH_PROMPTS}
                startIndex={promptStart}
                className="min-h-12 flex-1 rounded-2xl border border-(--color-line) bg-(--color-bg-soft) px-4 text-[15px] text-(--color-fg) outline-none placeholder:text-(--color-fg-dim) focus:border-(--color-fg-muted)"
              />
              <button
                type="submit"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-(--color-fg) px-5 text-sm font-semibold text-(--color-bg) transition hover:opacity-90"
              >
                Ask Scout
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-3">
              {[
                { href: "/search?sort=score-desc&scored=1", label: "Top scored" },
                { href: "/search?verdict=skip&sort=score-asc", label: "Skip list" },
                { href: "/search?sublabel=hidden_sweetener", label: "Hidden sweeteners" },
                { href: "/insights", label: "What we found" },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-(--color-line) px-4 py-2 text-sm font-medium text-(--color-fg-muted) transition hover:border-(--color-fg) hover:text-(--color-fg)"
                >
                  {label}
                </Link>
              ))}
            </div>

            <SuggestProductType />
          </div>
        </div>

        {/* Showcase marquee */}
        <div className="pb-12">
          <HomeShowcase products={shelves.showcase} />
        </div>

        {/* Stats strip */}
        <div className="mx-auto max-w-7xl px-6 pb-8">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <p className="text-[12px] leading-relaxed text-(--color-fg-muted)">
              <span className="font-semibold tabular-nums text-(--color-fg)">
                {shelves.totalScored.toLocaleString()}
              </span>{" "}
              products scored
            </p>
            <p className="text-[12px] leading-relaxed text-(--color-fg-muted)">
              <span className="font-semibold tabular-nums text-(--color-fg)">
                {shelves.catalogSize.toLocaleString()}
              </span>{" "}
              in the catalog
            </p>
            {insights.avgScore > 0 && (
              <p className="text-[12px] leading-relaxed text-(--color-fg-muted)">
                avg score{" "}
                <span className="font-semibold tabular-nums text-(--color-fg)">
                  {insights.avgScore}
                </span>
                /100
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Scout intel: data facts ───────────────────────────────────── */}
      {insights.facts.length > 0 && <LandingIntel facts={insights.facts} />}

      {/* ── Goal boards ───────────────────────────────────────────────── */}
      {insights.goalBoards.length > 0 && (
        <LandingGoalBoards
          boards={insights.goalBoards}
          initialIndex={initialGoalIndex}
        />
      )}

      {/* ── Daily staples rail ────────────────────────────────────────── */}
      <Rail
        eyebrow="Daily staples"
        title="Worth buying every week."
        subtitle="Whole foods or close to it. Score ≥ 80, no concern flags."
        cta={{ href: "/search?verdict=daily_staple", label: "All staples" }}
        items={shelves.dailyStaples}
      />

      <SiteFooter />
    </main>
  );
}

function Rail({
  eyebrow,
  title,
  subtitle,
  cta,
  items,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  cta?: { href: string; label: string };
  items: Awaited<ReturnType<typeof getHomeShelves>>["dailyStaples"];
}) {
  if (!items.length) return null;
  return (
    <section className="border-b border-(--color-line)">
      <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
              {eyebrow}
            </p>
            <h2 className="font-display mt-3 text-3xl leading-tight md:text-[2.5rem]">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-(--color-fg-muted)">
                {subtitle}
              </p>
            )}
          </div>
          {cta && (
            <Link
              href={cta.href}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-(--color-fg-muted) hover:text-(--color-fg)"
            >
              {cta.label}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((p) => (
            <HomeRailCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

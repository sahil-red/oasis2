import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { HomeRailCard } from "@/components/home-rail-card";
import { HomeShowcase } from "@/components/home-showcase";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getHomeShelves } from "@/lib/products/queries";

export const revalidate = 600;

export default async function Home() {
  const shelves = await getHomeShelves();

  return (
    <main className="min-h-screen">
      <SiteNav />

      {/* ── Hero: site identity + scrolling product showcase ─────────── */}
      <section className="border-b border-(--color-line)">
        <div className="mx-auto max-w-6xl px-6 pt-14 pb-12 md:pt-20">
          {/* Site identity */}
          <div className="max-w-3xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
              Honest grocery intel · India
            </p>
            <h1 className="font-display mt-5 text-balance text-5xl leading-[0.95] md:text-7xl">
              We read the back label{" "}
              <span className="italic text-(--color-accent)">so you don't have to</span>.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-(--color-fg-muted)">
              Every product on Indian grocery shelves, scored and labelled.
              What's a daily staple, what's a treat, what to skip — with the
              evidence printed right there on the back of the pack.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/search"
                className="inline-flex items-center gap-2 rounded-full bg-(--color-fg) px-5 py-2.5 text-sm font-medium text-(--color-bg) transition hover:opacity-90"
              >
                Browse the catalog
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/insights"
                className="inline-flex items-center gap-2 rounded-full border border-(--color-line) px-5 py-2.5 text-sm font-medium text-(--color-fg-muted) transition hover:border-(--color-fg) hover:text-(--color-fg)"
              >
                What we found
              </Link>
            </div>
          </div>
        </div>

        {/* Showcase marquee — full bleed */}
        <div className="pb-16">
          <HomeShowcase products={shelves.showcase} />
        </div>

        {/* Stats strip */}
        <div className="mx-auto max-w-6xl px-6 pb-8">
          <p className="text-[12px] leading-relaxed text-(--color-fg-muted)">
            <span className="font-semibold tabular-nums text-(--color-fg)">
              {shelves.totalScored.toLocaleString()}
            </span>{" "}
            products scored ·{" "}
            <span className="font-semibold tabular-nums text-(--color-fg)">
              {shelves.catalogSize.toLocaleString()}
            </span>{" "}
            in the catalog · scoring rules updated for V9
          </p>
        </div>
      </section>

      {/* ── Rails ─────────────────────────────────────────────────────── */}
      <Rail
        eyebrow="Daily staples"
        title="Worth buying every week."
        subtitle="Whole foods or close to it. Score ≥ 80, no concern flags."
        cta={{ href: "/search?verdict=daily_staple", label: "All staples" }}
        items={shelves.dailyStaples}
      />

      <Rail
        eyebrow="Skip list"
        title="The marketing's better than the food."
        subtitle="Score below 40, or hazardous flags. Mostly sugar, refined flour, and ultra-processed stuff dressed up in green wrappers."
        cta={{ href: "/search?verdict=skip", label: "Full skip list" }}
        items={shelves.skipWorthy}
      />

      <Rail
        eyebrow="Quietly good"
        title="Solid picks you might miss."
        subtitle="Top of their aisle. Not a daily staple, but you won't be embarrassed by the back label."
        cta={{ href: "/search?verdict=good_choice", label: "More good choices" }}
        items={shelves.bestValue}
      />

      {shelves.occasionalTreats.length > 0 ? (
        <Rail
          eyebrow="Occasional treats"
          title="Honest about what they are."
          subtitle="Not pretending to be healthy. Eaten mindfully, perfectly fine."
          cta={{ href: "/search?verdict=occasional_treat", label: "Treat shelf" }}
          items={shelves.occasionalTreats}
        />
      ) : null}

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
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
              {eyebrow}
            </p>
            <h2 className="font-display mt-3 text-3xl leading-tight md:text-[2.5rem]">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-(--color-fg-muted)">
                {subtitle}
              </p>
            ) : null}
          </div>
          {cta ? (
            <Link
              href={cta.href}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-(--color-fg-muted) hover:text-(--color-fg)"
            >
              {cta.label}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {items.map((p) => (
            <HomeRailCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

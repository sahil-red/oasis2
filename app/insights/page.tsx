import Link from "next/link";
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Leaf,
  Heart,
  Dumbbell,
  AlertTriangle,
  Award,
  BarChart3,
  Sparkles,
  Baby,
} from "lucide-react";
import { InsightFeaturedCard, InsightProductCard } from "@/components/insight-product-card";
import {
  InsightsCarouselSlide,
  InsightsProductCarousel,
} from "@/components/insights-product-carousel";
import { InsightsBrandBoard } from "@/components/insights-brand-board";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getCachedScoredCatalogForInsights } from "@/lib/products/catalog-cache";
import { marketingCallout } from "@/lib/products/insight-copy";
import { buildInsights } from "@/lib/products/insights";

export const revalidate = 600;

export default async function InsightsPage() {
  let products: Awaited<ReturnType<typeof getCachedScoredCatalogForInsights>> = [];
  try {
    products = await getCachedScoredCatalogForInsights();
  } catch (err) {
    console.warn("[insights] catalog load failed:", err);
  }
  const ins = buildInsights(products.filter((p) => p.core_scores));

  const topCategories = ins.categoryStats.slice(0, 5);
  const bottomCategories = [...ins.categoryStats].reverse().slice(0, 5);

  return (
    <main className="min-h-screen bg-(--color-bg)">
      <SiteNav />

      <div className="border-b border-(--color-line)">
        <div className="mx-auto max-w-6xl px-5 py-12 md:px-6 md:py-16">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
            {ins.totalScored.toLocaleString()} products analysed
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            What we found
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-(--color-fg-muted)">
            Patterns across the full catalog — staples, traps, and aisles that actually deliver.
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-sm text-(--color-fg-muted)">
            <span>Avg score <strong className="text-(--color-fg)">{ins.avgScore}/100</strong></span>
            <span>·</span>
            <span><strong className="text-emerald-500">{ins.dailyStapleCount.toLocaleString()}</strong> daily staples</span>
            <span>·</span>
            <span><strong className="text-red-500">{ins.skipCount.toLocaleString()}</strong> skip-worthy</span>
            <span>·</span>
            <span><strong className="text-(--color-fg)">{ins.categoryStats.length}</strong> categories</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-16 px-5 pb-24 pt-12 md:px-6">
        <Section
          icon={<Leaf className="h-5 w-5" />}
          tone="good"
          title="Daily staple shelf"
          subtitle={`${ins.dailyStapleCount.toLocaleString()} products score ≥80 with clean ingredients — worth buying every week.`}
          href="/search?verdict=daily_staple"
          hrefLabel="Browse staples"
        >
          <InsightsProductCarousel ariaLabel="Daily staples">
            {ins.dailyStaples.map(({ product }) => (
              <InsightsCarouselSlide key={product.id}>
                <InsightProductCard
                  product={product}
                  accent="value"
                  headline={`Score ${product.core_scores?.score ?? "—"} · Daily staple`}
                  subline={product.category ?? ""}
                />
              </InsightsCarouselSlide>
            ))}
          </InsightsProductCarousel>
        </Section>

        <Section
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="warn"
          title="Don't fall for the front label"
          subtitle="Health-halo claims checked against actual nutrition and ingredients."
          href="/search"
          hrefLabel={`${ins.misleading.length} flagged`}
          hrefStyle="warn"
        >
          {ins.featuredMisleading ? (
            <div className="mb-6">
              <InsightFeaturedCard
                product={ins.featuredMisleading}
                callout={marketingCallout(ins.featuredMisleading)}
              />
            </div>
          ) : null}
          <InsightsProductCarousel ariaLabel="Marketing reality check">
            {ins.misleading.slice(0, 16).map(({ product }) => {
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
        </Section>

        <Section
          icon={<TrendingDown className="h-5 w-5" />}
          tone="bad"
          title="Products to skip"
          subtitle="Score below 40 or hazardous additives — avoid when you have alternatives."
          href="/search?verdict=skip"
          hrefLabel="Full skip list"
        >
          <InsightsProductCarousel ariaLabel="Skip-worthy products">
            {ins.skipWorthy.slice(0, 16).map(({ product }) => (
              <InsightsCarouselSlide key={product.id}>
                <InsightProductCard
                  product={product}
                  accent="warn"
                  headline={`Score ${product.core_scores?.score ?? "—"} · Skip`}
                  subline={
                    (product.core_scores?.verdict_sublabels as string[] | undefined)
                      ?.slice(0, 2)
                      .map((s) => s.replace(/_/g, " "))
                      .join(" · ") ?? ""
                  }
                />
              </InsightsCarouselSlide>
            ))}
          </InsightsProductCarousel>
        </Section>

        <Section
          icon={<BarChart3 className="h-5 w-5" />}
          tone="neutral"
          title="Which aisles actually deliver"
          subtitle="Average score by category (minimum 10 products per aisle)."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
              <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-(--color-good)">
                <TrendingUp className="h-3.5 w-3.5" /> Top aisles
              </p>
              <ul className="space-y-3">
                {topCategories.map((c) => (
                  <CategoryRow key={c.category} stat={c} positive />
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
              <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-(--color-bad)">
                <TrendingDown className="h-3.5 w-3.5" /> Worst aisles
              </p>
              <ul className="space-y-3">
                {bottomCategories.map((c) => (
                  <CategoryRow key={c.category} stat={c} positive={false} />
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <Section
          icon={<BarChart3 className="h-5 w-5" />}
          tone="neutral"
          title="What the catalog actually contains"
          subtitle="How often each quality or concern signal appears across scored products."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-good)">
                Positive signals
              </p>
              <ul className="space-y-2.5">
                {ins.topSublabels.map((s) => (
                  <SublabelBar key={s.id} label={s.label} pct={s.pct} tone="good" />
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-(--color-bad)">
                Concern flags
              </p>
              <ul className="space-y-2.5">
                {ins.bottomSublabels.map((s) => (
                  <SublabelBar key={s.id} label={s.label} pct={s.pct} tone="bad" />
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {ins.gymPicks.length > 0 ? (
          <Section
            icon={<Dumbbell className="h-5 w-5" />}
            tone="good"
            title="Gym & performance"
            subtitle="High protein with low processing — fuel without junk."
            href="/search?goal=gym"
            hrefLabel="Gym goal shelf"
          >
            <InsightsProductCarousel ariaLabel="Gym picks">
              {ins.gymPicks.map(({ product }) => (
                <InsightsCarouselSlide key={product.id}>
                  <InsightProductCard
                    product={product}
                    accent="value"
                    headline={`${product.nutrition?.protein_g_100g ?? "—"}g protein / 100g`}
                    subline={`Score ${product.core_scores?.score ?? "—"}`}
                  />
                </InsightsCarouselSlide>
              ))}
            </InsightsProductCarousel>
          </Section>
        ) : null}

        {ins.gutHealthPicks.length > 0 ? (
          <Section
            icon={<Heart className="h-5 w-5" />}
            tone="good"
            title="Good for gut health"
            subtitle="Probiotic or prebiotic ingredients — dahi, kimchi, kefir, and more."
          >
            <InsightsProductCarousel ariaLabel="Gut health picks">
              {ins.gutHealthPicks.map(({ product }) => (
                <InsightsCarouselSlide key={product.id}>
                  <InsightProductCard
                    product={product}
                    accent="value"
                    headline="Probiotic / prebiotic"
                    subline={`Score ${product.core_scores?.score ?? "—"} · ${product.category ?? ""}`}
                  />
                </InsightsCarouselSlide>
              ))}
            </InsightsProductCarousel>
          </Section>
        ) : null}

        {ins.lowCalorieFills.length > 0 ? (
          <Section
            icon={<Leaf className="h-5 w-5" />}
            tone="good"
            title="Good for weight loss"
            subtitle="Low calorie per serve but still filling — not just empty low-cal marketing."
            href="/search?goal=fat-loss"
            hrefLabel="Fat loss shelf"
          >
            <InsightsProductCarousel ariaLabel="Weight loss picks">
              {ins.lowCalorieFills.map(({ product }) => (
                <InsightsCarouselSlide key={product.id}>
                  <InsightProductCard
                    product={product}
                    accent="value"
                    headline="Low-cal & filling"
                    subline={`Score ${product.core_scores?.score ?? "—"} · ${product.category ?? ""}`}
                  />
                </InsightsCarouselSlide>
              ))}
            </InsightsProductCarousel>
          </Section>
        ) : null}

        {ins.fiberLeaders.length > 0 ? (
          <Section
            icon={<Sparkles className="h-5 w-5" />}
            tone="good"
            title="Fiber leaders"
            subtitle="Whole grains, legumes, and staples that actually move the needle on fibre."
            href="/search?sublabel=rich_in_fiber"
            hrefLabel="High-fiber picks"
          >
            <InsightsProductCarousel ariaLabel="Fiber leaders">
              {ins.fiberLeaders.map(({ product }) => (
                <InsightsCarouselSlide key={product.id}>
                  <InsightProductCard
                    product={product}
                    accent="value"
                    headline={`${product.nutrition?.fiber_g_100g ?? "—"}g fiber / 100g`}
                    subline={`Score ${product.core_scores?.score ?? "—"} · ${product.category ?? ""}`}
                  />
                </InsightsCarouselSlide>
              ))}
            </InsightsProductCarousel>
          </Section>
        ) : null}

        {ins.kidFriendly.length > 0 ? (
          <Section
            icon={<Baby className="h-5 w-5" />}
            tone="good"
            title="Kid-friendly shelf"
            subtitle="No artificial flavours or hidden sweeteners — snacks and staples parents can trust."
            href="/search?goal=kids"
            hrefLabel="Kids goal shelf"
          >
            <InsightsProductCarousel ariaLabel="Kid-friendly picks">
              {ins.kidFriendly.map(({ product }) => (
                <InsightsCarouselSlide key={product.id}>
                  <InsightProductCard
                    product={product}
                    accent="value"
                    headline={`Score ${product.core_scores?.score ?? "—"}`}
                    subline={product.category ?? ""}
                  />
                </InsightsCarouselSlide>
              ))}
            </InsightsProductCarousel>
          </Section>
        ) : null}

        {ins.bestInCohort.length > 0 ? (
          <Section
            icon={<Award className="h-5 w-5" />}
            tone="warn"
            title="Best of a bad bunch"
            subtitle="Top of their aisle even when the category skews unhealthy — your best option there."
          >
            <InsightsProductCarousel ariaLabel="Best in cohort">
              {ins.bestInCohort.map(({ product }) => (
                <InsightsCarouselSlide key={product.id}>
                  <InsightProductCard
                    product={product}
                    accent="snack"
                    badge="Best in category"
                    headline={`Top ${100 - (product.core_scores?.relative_score ?? 80)}% of its category`}
                    subline={`Score ${product.core_scores?.score ?? "—"}`}
                  />
                </InsightsCarouselSlide>
              ))}
            </InsightsProductCarousel>
          </Section>
        ) : null}

        {ins.ultraProcessedWorst.length > 0 ? (
          <Section
            icon={<AlertTriangle className="h-5 w-5" />}
            tone="bad"
            title="Most ultra-processed"
            subtitle="Heavy NOVA-4 ingredient load — high processing, low intrinsic quality."
          >
            <InsightsProductCarousel ariaLabel="Ultra-processed">
              {ins.ultraProcessedWorst.map(({ product }) => (
                <InsightsCarouselSlide key={product.id}>
                  <InsightProductCard
                    product={product}
                    accent="warn"
                    headline="Ultra-processed"
                    subline={`Score ${product.core_scores?.score ?? "—"}`}
                  />
                </InsightsCarouselSlide>
              ))}
            </InsightsProductCarousel>
          </Section>
        ) : null}

        <section>
          <InsightsBrandBoard cleanest={ins.cleanestBrands} weakest={ins.weakestBrands} />
        </section>

        <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) px-6 py-10 text-center">
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

function StatPill({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good"
      ? "var(--color-good)"
      : tone === "bad"
        ? "var(--color-bad)"
        : "var(--color-fg-dim)";
  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        borderColor: `color-mix(in srgb, ${color} 25%, var(--color-line))`,
        backgroundColor: `color-mix(in srgb, ${color} 8%, var(--color-panel))`,
      }}
    >
      <p
        className="text-[11px] font-medium uppercase tracking-[0.14em]"
        style={{ color: `color-mix(in srgb, ${color} 70%, var(--color-fg-muted))` }}
      >
        {label}
      </p>
      <p className="mt-1 font-display text-3xl leading-none tabular-nums" style={{ color }}>
        {value}
        <span
          className="ml-1 text-sm font-normal"
          style={{ color: `color-mix(in srgb, ${color} 65%, var(--color-fg-dim))` }}
        >
          {unit}
        </span>
      </p>
    </div>
  );
}

function Section({
  icon,
  tone = "neutral",
  title,
  subtitle,
  href,
  hrefLabel,
  hrefStyle = "default",
  children,
}: {
  icon: React.ReactNode;
  tone?: "good" | "bad" | "warn" | "neutral";
  title: string;
  subtitle: string;
  href?: string;
  hrefLabel?: string;
  hrefStyle?: "default" | "warn";
  children: React.ReactNode;
}) {
  const accent =
    tone === "good"
      ? "var(--color-good)"
      : tone === "bad"
        ? "var(--color-bad)"
        : tone === "warn"
          ? "var(--color-warn)"
          : "var(--color-accent)";
  const linkWarn = hrefStyle === "warn";

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{
              backgroundColor: `color-mix(in srgb, ${accent} 14%, var(--color-panel))`,
              color: accent,
            }}
          >
            {icon}
          </span>
          <div>
            <h2 className="font-display text-2xl md:text-3xl">{title}</h2>
            <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-(--color-fg-muted)">
              {subtitle}
            </p>
          </div>
        </div>
        {href && hrefLabel ? (
          <Link
            href={href}
            className="shrink-0 rounded-full border px-3 py-1 text-sm font-medium transition hover:opacity-80"
            style={
              linkWarn
                ? {
                    borderColor: `color-mix(in srgb, var(--color-warn) 35%, var(--color-line))`,
                    color: "var(--color-warn)",
                    backgroundColor: `color-mix(in srgb, var(--color-warn) 8%, var(--color-panel))`,
                  }
                : {
                    borderColor: `color-mix(in srgb, var(--color-good) 35%, var(--color-line))`,
                    color: "var(--color-good)",
                    backgroundColor: `color-mix(in srgb, var(--color-good) 8%, var(--color-panel))`,
                  }
            }
          >
            {hrefLabel} →
          </Link>
        ) : null}
      </div>
      <div className="px-2 sm:px-6">{children}</div>
    </section>
  );
}

function SublabelBar({
  label,
  pct,
  tone,
}: {
  label: string;
  pct: number;
  tone: "good" | "bad";
}) {
  const color = tone === "good" ? "var(--color-good)" : "var(--color-bad)";
  return (
    <li className="flex items-center gap-3">
      <span className="w-36 shrink-0 truncate text-[13px] capitalize text-(--color-fg-muted)">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--color-line)">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: color,
            opacity: 0.85,
          }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-(--color-fg-dim)">
        {pct}%
      </span>
    </li>
  );
}

function CategoryRow({
  stat,
  positive,
}: {
  stat: {
    category: string;
    avgScore: number;
    count: number;
    dailyStapleCount: number;
    skipCount: number;
  };
  positive: boolean;
}) {
  const score = Math.round(stat.avgScore);
  const color =
    score >= 70
      ? "var(--color-good)"
      : score >= 50
        ? "var(--color-good)"
        : score >= 35
          ? "var(--color-warn)"
          : "var(--color-bad)";
  return (
    <li className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-(--color-fg)">{stat.category}</p>
        <p className="text-[11px] text-(--color-fg-dim)">
          {stat.count} products
          {positive
            ? stat.dailyStapleCount > 0
              ? ` · ${stat.dailyStapleCount} staples`
              : ""
            : stat.skipCount > 0
              ? ` · ${stat.skipCount} skip`
              : ""}
        </p>
      </div>
      <span
        className="shrink-0 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums"
        style={{
          color,
          backgroundColor: `color-mix(in srgb, ${color} 14%, var(--color-panel))`,
        }}
      >
        {score}
      </span>
    </li>
  );
}

import Link from "next/link";
import { ArrowRight, TrendingUp, TrendingDown, Zap, Leaf, Heart, Dumbbell, ShoppingBag, AlertTriangle, Award, BarChart3 } from "lucide-react";
import { InsightFeaturedCard, InsightProductCard } from "@/components/insight-product-card";
import {
  InsightsCarouselSlide,
  InsightsProductCarousel,
} from "@/components/insights-product-carousel";
import { InsightsBrandBoard } from "@/components/insights-brand-board";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getCachedScoredCatalogForInsights } from "@/lib/products/catalog-cache";
import {
  marketingCallout,
  proteinPerRupeeLine,
  proteinValueBlurb,
  snackBlurb,
} from "@/lib/products/insight-copy";
import { buildInsights } from "@/lib/products/insights";

export const dynamic = "force-dynamic";
export const revalidate = 120;

export default async function InsightsPage() {
  const products = await getCachedScoredCatalogForInsights();
  const ins = buildInsights(products.filter((p) => p.core_scores));

  const topCategories = ins.categoryStats.slice(0, 5);
  const bottomCategories = [...ins.categoryStats].reverse().slice(0, 5);

  return (
    <main className="min-h-screen bg-(--color-bg)">
      <SiteNav />

      {/* ── Hero ── */}
      <div className="border-b border-(--color-line) bg-(--color-bg)">
        <div className="mx-auto max-w-6xl px-5 py-12 md:px-6 md:py-16">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
            Evidence-based · {ins.totalScored.toLocaleString()} products analysed
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
            Grocery intelligence
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-(--color-fg-muted)">
            What the nutrition labels actually say — across every aisle.
          </p>

          {/* catalog-wide stat strip */}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatPill label="Avg catalog score" value={`${ins.avgScore}`} unit="/100" color="#0f9e75" />
            <StatPill label="Daily staples" value={ins.dailyStapleCount.toLocaleString()} unit="products" color="#7ab830" />
            <StatPill label="Skip-worthy" value={ins.skipCount.toLocaleString()} unit="products" color="#d43030" />
            <StatPill label="Scored products" value={ins.totalScored.toLocaleString()} unit="total" color="#94a3b8" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-16 px-5 pb-24 pt-12 md:px-6">

        {/* ── 1. Daily staples leaderboard ── */}
        <Section
          icon={<Leaf className="h-5 w-5" />}
          iconColor="#0f9e75"
          title="Daily staple shelf"
          subtitle={`${ins.dailyStapleCount} products score ≥80 with clean ingredients and no concern flags — whole foods worth buying every week.`}
          href="/search?sort=score-desc"
          hrefLabel="Browse all staples"
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

        {/* ── 2. Sublabel breakdown ── */}
        <Section
          icon={<BarChart3 className="h-5 w-5" />}
          iconColor="#7ab830"
          title="What the catalog actually contains"
          subtitle="How often each quality or concern signal appears across all scored products."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0f9e75]">
                Positive signals
              </p>
              <ul className="space-y-2.5">
                {ins.topSublabels.map((s) => (
                  <SublabelBar key={s.id} label={s.label} pct={s.pct} count={s.count} color="#0f9e75" />
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d43030]">
                Concern flags
              </p>
              <ul className="space-y-2.5">
                {ins.bottomSublabels.map((s) => (
                  <SublabelBar key={s.id} label={s.label} pct={s.pct} count={s.count} color="#d43030" />
                ))}
              </ul>
            </div>
          </div>
        </Section>

        {/* ── 3. Marketing callouts ── */}
        <Section
          icon={<AlertTriangle className="h-5 w-5" />}
          iconColor="#e07030"
          title="Don't fall for the front label"
          subtitle="Health-halo claims on pack, checked against actual nutrition and ingredients."
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
                  <InsightProductCard product={product} accent="warn" badge="Callout" headline={c.reality} subline={c.claim} />
                </InsightsCarouselSlide>
              );
            })}
          </InsightsProductCarousel>
        </Section>

        {/* ── 4. Skip-worthy ── */}
        <Section
          icon={<TrendingDown className="h-5 w-5" />}
          iconColor="#d43030"
          title="Products to skip"
          subtitle="Score below 40 or contain hazardous additives — avoid or use only when nothing else is available."
        >
          <InsightsProductCarousel ariaLabel="Skip-worthy products">
            {ins.skipWorthy.slice(0, 16).map(({ product }) => (
              <InsightsCarouselSlide key={product.id}>
                <InsightProductCard
                  product={product}
                  accent="warn"
                  headline={`Score ${product.core_scores?.score ?? "—"} · Skip`}
                  subline={(product.core_scores?.verdict_sublabels as string[] | undefined)?.slice(0, 2).map((s) => s.replace(/_/g, " ")).join(" · ") ?? ""}
                />
              </InsightsCarouselSlide>
            ))}
          </InsightsProductCarousel>
        </Section>

        {/* ── 5. Category scorecard ── */}
        <Section
          icon={<BarChart3 className="h-5 w-5" />}
          iconColor="#7ab830"
          title="Which aisles actually deliver"
          subtitle="Average V9 score across each product category (min. 10 products)."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
              <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0f9e75]">
                <TrendingUp className="h-3.5 w-3.5" /> Top aisles
              </p>
              <ul className="space-y-3">
                {topCategories.map((c) => (
                  <CategoryRow key={c.category} stat={c} positive />
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
              <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d43030]">
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

        {/* ── 6. Gym picks ── */}
        {ins.gymPicks.length > 0 ? (
          <Section
            icon={<Dumbbell className="h-5 w-5" />}
            iconColor="#7ab830"
            title="Gym & performance picks"
            subtitle="High protein per serving with low NOVA processing score — fuel without junk."
            href="/search?goal=muscle"
            hrefLabel="Muscle goal shelf"
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

        {/* ── 7. Gut health ── */}
        {ins.gutHealthPicks.length > 0 ? (
          <Section
            icon={<Heart className="h-5 w-5" />}
            iconColor="#0f9e75"
            title="Good for gut health"
            subtitle="Probiotic or prebiotic ingredients, innocuous concern tier — dahi, kimchi, kefir, and more."
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

        {/* ── 8. Best protein value ── */}
        <Section
          icon={<Zap className="h-5 w-5" />}
          iconColor="#7ab830"
          title="Best protein per rupee"
          subtitle="Ranked by grams of protein in the pack per ₹100 — not just the 'high protein' label."
          href="/search?goal=protein-budget"
          hrefLabel="Shop protein value"
        >
          <InsightsProductCarousel ariaLabel="Best protein per rupee">
            {ins.proteinPerRupee.map(({ product }) => (
              <InsightsCarouselSlide key={product.id}>
                <InsightProductCard product={product} accent="value" badge="Value" headline={proteinValueBlurb(product)} subline={proteinPerRupeeLine(product)} />
              </InsightsCarouselSlide>
            ))}
          </InsightsProductCarousel>
        </Section>

        {/* ── 9. Weight loss / low cal ── */}
        {ins.lowCalorieFills.length > 0 ? (
          <Section
            icon={<Leaf className="h-5 w-5" />}
            iconColor="#0f9e75"
            title="Good for weight loss"
            subtitle="≤150 kcal per serve with at least 5g protein and 2g fiber — actually filling, not just low-calorie."
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

        {/* ── 10. Best-in-cohort ── */}
        {ins.bestInCohort.length > 0 ? (
          <Section
            icon={<Award className="h-5 w-5" />}
            iconColor="#e07030"
            title="Best of a bad bunch"
            subtitle="Relative percentile ≥ 80 even though absolute score is below 65 — your best option in that aisle."
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

        {/* ── 11. High-protein snacks ── */}
        <Section
          icon={<ShoppingBag className="h-5 w-5" />}
          iconColor="#7ab830"
          title="Better snack shelf"
          subtitle="Snacks with real protein — not just marketing on the bag."
          href="/basket"
          hrefLabel="Rate my cart"
        >
          <InsightsProductCarousel ariaLabel="High-protein snacks">
            {ins.highProteinSnacks.map(({ product }) => (
              <InsightsCarouselSlide key={product.id}>
                <InsightProductCard product={product} accent="snack" headline={snackBlurb(product)} subline={`${product.nutrition?.protein_g_100g ?? "—"}g protein / 100g`} />
              </InsightsCarouselSlide>
            ))}
          </InsightsProductCarousel>
        </Section>

        {/* ── 12. Ultra-processed worst ── */}
        {ins.ultraProcessedWorst.length > 0 ? (
          <Section
            icon={<AlertTriangle className="h-5 w-5" />}
            iconColor="#d43030"
            title="Most ultra-processed"
            subtitle="NOVA-4 share over 40-60% by position weight — high processing, low intrinsic quality."
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

        {/* ── 13. Brand boards ── */}
        <section>
          <InsightsBrandBoard cleanest={ins.cleanestBrands} weakest={ins.weakestBrands} />
        </section>

        {/* ── CTA ── */}
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

// ── Helpers ──

function StatPill({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: `${color}30`, backgroundColor: `${color}0d` }}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: `${color}aa` }}>
        {label}
      </p>
      <p className="mt-1 font-display text-3xl leading-none tabular-nums" style={{ color }}>
        {value}
        <span className="ml-1 text-sm font-normal" style={{ color: `${color}99` }}>{unit}</span>
      </p>
    </div>
  );
}

function Section({
  icon,
  iconColor,
  title,
  subtitle,
  href,
  hrefLabel,
  hrefStyle = "default",
  children,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  subtitle: string;
  href?: string;
  hrefLabel?: string;
  hrefStyle?: "default" | "warn";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `${iconColor}18`, color: iconColor }}
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
              hrefStyle === "warn"
                ? { borderColor: "#e0703040", color: "#e07030", backgroundColor: "#e070300d" }
                : { borderColor: "#7ab83040", color: "#7ab830", backgroundColor: "#7ab8300d" }
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

function SublabelBar({ label, pct, count, color }: { label: string; pct: number; count: number; color: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-36 shrink-0 truncate text-[13px] capitalize text-(--color-fg-muted)">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-white/[0.05]" style={{ height: 6 }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color, opacity: 0.8 }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-(--color-fg-dim)">
        {pct}%
      </span>
    </li>
  );
}

function CategoryRow({ stat, positive }: { stat: { category: string; avgScore: number; count: number; dailyStapleCount: number; skipCount: number }; positive: boolean }) {
  const score = Math.round(stat.avgScore);
  const color = score >= 70 ? "#0f9e75" : score >= 50 ? "#7ab830" : score >= 35 ? "#e07030" : "#d43030";
  return (
    <li className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-(--color-fg)">{stat.category}</p>
        <p className="text-[11px] text-(--color-fg-dim)">
          {stat.count} products
          {positive
            ? stat.dailyStapleCount > 0 ? ` · ${stat.dailyStapleCount} staples` : ""
            : stat.skipCount > 0 ? ` · ${stat.skipCount} skip` : ""}
        </p>
      </div>
      <span
        className="shrink-0 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums"
        style={{ color, backgroundColor: `${color}18` }}
      >
        {score}
      </span>
    </li>
  );
}

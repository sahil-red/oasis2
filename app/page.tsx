import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { HomeRailCard } from "@/components/home-rail-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { catalogCardDisplayName } from "@/lib/products/card-display-name";
import { getHomeShelves } from "@/lib/products/queries";
import { resolveProductVerdict } from "@/lib/scoring/verdict-resolve";
import { sublabelChipLabels, VERDICT_COLORS } from "@/lib/scoring/verdict-display";

export const revalidate = 600;

/** Tiny editorial caption based on what the LM/scoring actually flagged. */
function heroPitch(productName: string, sublabels: string[] | null | undefined): string {
  const labels = (sublabels ?? []).map((s) => s.toLowerCase());
  if (labels.includes("very_high_in_sugar")) return "Practically dessert in a wrapper.";
  if (labels.includes("high_in_sugar")) return "Mostly sugar wearing health-food clothes.";
  if (labels.includes("excessive_sodium")) return "More sodium than your kidneys appreciate.";
  if (labels.includes("hidden_sweetener")) return "Says 'natural'. Reads aspartame on the back.";
  if (labels.includes("ultra_processed") || labels.includes("mostly_nova_4")) {
    return "Engineered, not cooked.";
  }
  if (labels.includes("artificial_flavors")) return "Flavour from a lab, not a kitchen.";
  if (labels.includes("trans_fat_present")) return "Trans fats are still in here.";
  if (/biscuit|cookie/i.test(productName)) return "A snack pretending to be breakfast.";
  if (/chips|wafer|crisp/i.test(productName)) return "The label is louder than the nutrition.";
  if (/cola|soda|drink/i.test(productName)) return "A glass of sugar with a brand on it.";
  return "We read the back label. You'll want to look too.";
}

export default async function Home() {
  const shelves = await getHomeShelves();
  const hero = shelves.hero;
  const heroVerdict = hero?.core_scores
    ? resolveProductVerdict({
        verdict: hero.core_scores.verdict,
        score: hero.core_scores.score,
        name: hero.name,
        category: hero.category,
        subcategory: hero.subcategory,
      })
    : null;
  const heroColors = heroVerdict ? VERDICT_COLORS[heroVerdict] : null;
  const heroChips = sublabelChipLabels(hero?.core_scores?.verdict_sublabels).slice(0, 3);

  return (
    <main className="min-h-screen">
      <SiteNav />

      {/* ── Hero: editorial cover ─────────────────────────────────────── */}
      <section className="border-b border-(--color-line)">
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-12 md:pt-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
            This week's read
          </p>
          <div className="mt-6 grid items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div>
              <h1 className="font-display text-5xl leading-[0.95] md:text-7xl">
                {hero ? "We're skipping " : "Honest grocery intel "}
                {hero ? (
                  <span className="italic text-(--color-accent)">
                    {hero.brand ?? "this one"}
                  </span>
                ) : (
                  <span className="italic text-(--color-accent)">for India</span>
                )}
                {hero ? "." : "."}
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-(--color-fg-muted)">
                {hero
                  ? heroPitch(hero.name, hero.core_scores?.verdict_sublabels)
                  : "We read the back label so you don't have to. Verdicts, swaps, and what to skip — across 17,000 Indian grocery products."}
              </p>

              {hero ? (
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  {heroVerdict && heroColors ? (
                    <span
                      className="rounded-full border px-3 py-1 text-[12px] font-semibold tracking-tight"
                      style={{
                        backgroundColor: heroColors.bg,
                        color: heroColors.fg,
                        borderColor: heroColors.border,
                      }}
                    >
                      {heroVerdict === "skip"
                        ? "Skip"
                        : heroVerdict === "occasional_treat"
                          ? "Occasional treat"
                          : heroVerdict === "good_choice"
                            ? "Good choice"
                            : "Daily staple"}
                    </span>
                  ) : null}
                  {heroChips.map((label) => (
                    <span
                      key={label}
                      className="rounded-full border border-(--color-line) px-2.5 py-1 text-[11px] text-(--color-fg-muted)"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-9 flex flex-wrap gap-3">
                <Link
                  href="/search"
                  className="inline-flex items-center gap-2 rounded-full bg-(--color-fg) px-5 py-2.5 text-sm font-medium text-(--color-bg) transition hover:opacity-90"
                >
                  Browse the catalog
                  <ArrowRight className="h-4 w-4" />
                </Link>
                {hero ? (
                  <Link
                    href={`/product/${hero.slug}`}
                    className="inline-flex items-center gap-2 rounded-full border border-(--color-line) px-5 py-2.5 text-sm font-medium text-(--color-fg-muted) hover:border-(--color-fg) hover:text-(--color-fg)"
                  >
                    Read the verdict
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </div>

            {/* hero image */}
            {hero?.image_urls[0] ? (
              <Link
                href={`/product/${hero.slug}`}
                className="group relative block aspect-[4/5] overflow-hidden rounded-3xl bg-[#1c1c1c]"
              >
                <Image
                  src={hero.image_urls[0]}
                  alt={hero.name}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 600px"
                  className="object-contain p-8 transition-transform duration-500 group-hover:scale-[1.02]"
                />
                {hero.brand ? (
                  <p className="absolute bottom-5 left-5 text-[10px] uppercase tracking-[0.18em] text-white/50">
                    {hero.brand}
                  </p>
                ) : null}
                <p className="absolute bottom-5 right-5 max-w-[60%] text-right font-display text-base italic text-white/85">
                  {catalogCardDisplayName(hero.name)}
                </p>
              </Link>
            ) : (
              <div className="grid aspect-[4/5] place-items-center rounded-3xl bg-(--color-bg-soft) text-sm text-(--color-fg-dim)">
                Loading featured pick…
              </div>
            )}
          </div>
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
        subtitle="Top 20% of their aisle. Not a daily staple, but you won't be embarrassed by the back label."
        cta={{ href: "/search?verdict=good_choice", label: "More good choices" }}
        items={shelves.bestValue}
      />

      {/* ── Footer line: stats ───────────────────────────────────────── */}
      <section className="border-t border-(--color-line) bg-(--color-bg-soft)/50">
        <div className="mx-auto max-w-6xl px-6 py-10 text-[13px] text-(--color-fg-muted)">
          <p className="font-medium text-(--color-fg)">Scout, in numbers.</p>
          <p className="mt-2 leading-relaxed">
            <span className="font-semibold tabular-nums text-(--color-fg)">
              {shelves.totalScored.toLocaleString()}
            </span>{" "}
            products scored ·{" "}
            <span className="font-semibold tabular-nums text-(--color-fg)">
              {shelves.catalogSize.toLocaleString()}
            </span>{" "}
            in the catalog · scoring rules updated for V9. We read the back label, not the press release.
          </p>
        </div>
      </section>

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

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type {
  LandingBestInClassCategory,
  LandingDodgeProduct,
} from "@/lib/products/landing-insights";

/**
 * "Today's reckoning" — the betrayal hook. Beloved products whose front-of-pack
 * marketing doesn't survive the back label. This is the most human, most
 * shareable unit on the homepage; it earns the scroll the old staples rail didn't.
 */
export function HomeReckoning({ products }: { products: LandingDodgeProduct[] }) {
  const picks = products.slice(0, 3);
  if (picks.length < 2) return null;
  return (
    <section className="border-b border-(--color-line)">
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-bad)">
              Today&apos;s reckoning
            </p>
            <h2 className="font-display mt-2 text-3xl leading-tight md:text-[2.5rem]">
              The marketing&apos;s a lie.
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-(--color-fg-muted)">
              Front-of-pack says one thing. The back label says another. We read both.
            </p>
          </div>
          <Link
            href="/search?verdict=skip&sort=score-asc"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-(--color-fg-muted) transition hover:text-(--color-fg)"
          >
            Full skip list
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {picks.map((p) => (
            <Link
              key={p.slug}
              href={`/product/${p.slug}`}
              className="group flex flex-col rounded-2xl border border-(--color-line) bg-(--color-panel) p-4 transition hover:border-(--color-bad)/40"
            >
              <div className="flex items-start gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-(--color-bg-soft)">
                  {p.image ? (
                    <Image src={p.image} alt={p.name} fill sizes="56px" className="object-contain p-1" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  {p.brand ? (
                    <p className="truncate text-[10px] uppercase tracking-[0.14em] text-(--color-fg-dim)">
                      {p.brand}
                    </p>
                  ) : null}
                  <p className="line-clamp-2 text-[14px] font-medium leading-snug text-(--color-fg) group-hover:text-(--color-accent)">
                    {p.name}
                  </p>
                </div>
                <span className="font-display shrink-0 text-2xl tabular-nums text-(--color-bad)">
                  {p.score}
                </span>
              </div>
              <div className="mt-3 space-y-1.5 border-t border-(--color-line) pt-3 text-[12px] leading-snug">
                <p className="text-(--color-fg-muted)">
                  <span className="font-semibold uppercase tracking-wide text-(--color-fg-dim)">Claims </span>
                  {p.claim}
                </p>
                <p className="text-(--color-fg)">
                  <span className="font-semibold uppercase tracking-wide text-(--color-bad)">Really </span>
                  {p.reality}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Category grid — the "where do I start?" answer. Each aisle with one damning
 * micro-stat. Scannable, invites exploration, far better than a single product rail.
 */
export function HomeCategoryGrid({ categories }: { categories: LandingBestInClassCategory[] }) {
  const cats = categories.slice(0, 8);
  if (cats.length < 3) return null;
  return (
    <section>
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <div className="mb-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
            Start somewhere
          </p>
          <h2 className="font-display mt-2 text-3xl leading-tight md:text-[2.5rem]">
            Every aisle, judged.
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cats.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="group rounded-2xl border border-(--color-line) bg-(--color-panel) p-4 transition hover:border-(--color-fg-muted) hover:-translate-y-0.5"
            >
              <p className="text-[15px] font-medium text-(--color-fg) group-hover:text-(--color-accent)">
                {c.label}
              </p>
              <p className="mt-2 flex items-center gap-2 text-[12px] tabular-nums text-(--color-fg-dim)">
                <span>
                  avg <span className="font-semibold text-(--color-fg-muted)">{c.avgScore}</span>
                </span>
                <span aria-hidden>·</span>
                <span className="text-(--color-bad)">{c.skipPct}% skip</span>
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

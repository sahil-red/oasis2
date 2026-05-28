import Image from "next/image";
import Link from "next/link";
import { resolveProductVerdict } from "@/lib/scoring/verdict-resolve";
import { VERDICT_COLORS } from "@/lib/scoring/verdict-display";
import { catalogCardDisplayName } from "@/lib/products/card-display-name";
import type { ProductListItem } from "@/lib/products/queries";

const VERDICT_LABEL: Record<string, string> = {
  daily_staple: "Daily staple",
  good_choice: "Good choice",
  occasional_treat: "Treat",
  skip: "Skip",
};

/**
 * Auto-scrolling product showcase for the homepage hero.
 * 6 products, mixed verdicts — communicates the site's scope at a glance.
 *
 * Pure CSS animation, server-rendered, zero JS.
 * On hover, the marquee pauses (group-hover).
 */
export function HomeShowcase({ products }: { products: ProductListItem[] }) {
  if (!products.length) return null;

  // Duplicate the list so the marquee can loop seamlessly
  const loop = [...products, ...products];

  return (
    <div className="group relative -mx-6 overflow-hidden">
      {/* fade edges */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-(--color-bg) to-transparent md:w-24" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-(--color-bg) to-transparent md:w-24" />

      <div className="flex gap-5 px-6 marquee-track group-hover:[animation-play-state:paused]">
        {loop.map((product, i) => (
          <ShowcaseCard key={`${product.id}-${i}`} product={product} eager={i < 6} />
        ))}
      </div>
    </div>
  );
}

function ShowcaseCard({ product, eager }: { product: ProductListItem; eager: boolean }) {
  const core = product.core_scores;
  const verdict = core
    ? resolveProductVerdict({
        verdict: core.verdict,
        score: core.score,
        name: product.name,
        category: product.category,
        subcategory: product.subcategory,
      })
    : null;
  const c = verdict ? VERDICT_COLORS[verdict] : null;
  const label = verdict ? VERDICT_LABEL[verdict] ?? null : null;
  const name = catalogCardDisplayName(product.name);
  const thumb = product.image_urls[0];

  return (
    <Link
      href={`/product/${product.slug}`}
      className="group/card relative block w-[200px] shrink-0 sm:w-[240px]"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl photo-frame transition-transform duration-300 ease-out group-hover/card:scale-[1.02]">
        {thumb ? (
          <Image
            src={thumb}
            alt={name}
            fill
            sizes="(max-width: 640px) 200px, 240px"
            priority={eager}
            className="object-contain p-4"
          />
        ) : null}
        {label && c ? (
          <span
            className="absolute left-3 top-3 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-tight"
            style={{
              backgroundColor: c.bg,
              color: c.fg,
              borderColor: c.border,
            }}
          >
            {label}
          </span>
        ) : null}
      </div>
      <div className="mt-3">
        {product.brand ? (
          <p className="truncate text-[10px] uppercase tracking-[0.14em] text-(--color-fg-dim)">
            {product.brand}
          </p>
        ) : null}
        <p className="line-clamp-2 mt-0.5 text-[13px] leading-snug text-(--color-fg)">
          {name}
        </p>
      </div>
    </Link>
  );
}

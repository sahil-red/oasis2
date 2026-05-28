import { memo } from "react";
import Image from "next/image";
import Link from "next/link";
import { AddToBasketButton } from "@/components/add-to-basket-button";
import { saveCatalogReturnUrl } from "@/components/catalog-back-link";
import { GoalFitBadge, ScoreBadge } from "@/components/score-display";
import { catalogCardDisplayName } from "@/lib/products/card-display-name";
import { resolveProductVerdict } from "@/lib/scoring/verdict-resolve";
import { sublabelChipLabels, VERDICT_COLORS } from "@/lib/scoring/verdict-display";
import type { VerdictId } from "@/lib/scoring/verdict";
import type { CatalogGridItem, ProductListItem } from "@/lib/products/queries";
import { displayPriceInr, showMrpStrike } from "@/lib/products/display-price";

export const ProductCard = memo(function ProductCard({
  product,
  goalFit,
  hrefQuery = "",
  onSublabelClick,
}: {
  product: ProductListItem | CatalogGridItem;
  goalFit?: number;
  hrefQuery?: string;
  onSublabelClick?: (sublabel: string) => void;
}) {
  const thumb = product.image_urls[0];
  const core = product.core_scores;
  const verdict: VerdictId | null = core
    ? resolveProductVerdict({
        verdict: core.verdict,
        score: core.score,
        name: product.name,
        category: product.category,
        subcategory: product.subcategory,
      })
    : null;
  const price = displayPriceInr(product);
  const href = `/product/${product.slug}${hrefQuery}`;
  const displayName = catalogCardDisplayName(product.name);
  const sublabelIds = goalFit == null ? (core?.verdict_sublabels as string[] | undefined) : undefined;
  const chipLabels = sublabelChipLabels(sublabelIds);
  const vc = verdict ? VERDICT_COLORS[verdict] : null;

  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.06] transition-all duration-200 hover:border-white/[0.18] hover:-translate-y-0.5"
      style={vc ? { borderLeftColor: vc.chipBorder, borderLeftWidth: 3 } : undefined}
    >
      {/* image */}
      <div className="relative aspect-square shrink-0 overflow-visible">
        <div className="relative h-full w-full overflow-hidden bg-[#1c1c1c]">
          <Link
            href={href}
            className="absolute inset-0 z-0 block"
            tabIndex={-1}
            aria-hidden
            onClick={() => saveCatalogReturnUrl(`/search${hrefQuery}`)}
          >
            {thumb ? (
              <Image
                src={thumb}
                alt={displayName}
                fill
                className="object-contain p-1.5 transition duration-300 ease-out group-hover:scale-[1.01]"
                sizes="(max-width: 768px) 50vw, 20vw"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-xs text-(--color-fg-dim)">
                No image
              </div>
            )}
          </Link>
        </div>
        {goalFit != null ? (
          <div className="absolute -right-1 -top-1 z-10">
            <GoalFitBadge fit={goalFit} />
          </div>
        ) : core ? (
          <div className="absolute -right-1 -top-1 z-10">
            <ScoreBadge score={core.score} grade={core.grade} verdict={verdict} />
          </div>
        ) : null}
      </div>

      {/* content */}
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <Link
          href={href}
          className="block flex-1"
          onClick={() => saveCatalogReturnUrl(`/search${hrefQuery}`)}
        >
          {product.brand ? (
            <p className="truncate text-[10px] uppercase tracking-[0.12em] text-(--color-fg-dim)">
              {product.brand}
            </p>
          ) : (
            <span className="block h-[13px]" aria-hidden />
          )}
          <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-(--color-fg) group-hover:text-(--color-accent)">
            {displayName}
          </h3>
        </Link>

        {/* chips — clickable to filter */}
        {chipLabels.length > 0 && vc ? (
          <div className="flex flex-wrap gap-1">
            {chipLabels.slice(0, 3).map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => onSublabelClick?.(sublabelIds![i]!)}
                className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-tight tracking-wide transition hover:opacity-80"
                style={{ borderColor: vc.chipBorder, color: vc.chipFg }}
                title={onSublabelClick ? `Filter: ${label}` : label}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {/* price row */}
        <div className="flex items-center justify-between gap-1 border-t border-white/[0.05] pt-1.5">
          <div>
            {price != null ? (
              <span className="text-[14px] font-semibold tabular-nums text-(--color-fg)">
                ₹{price}
              </span>
            ) : (
              <span className="text-xs text-(--color-fg-dim)">—</span>
            )}
            {showMrpStrike(product) ? (
              <span className="ml-1 text-[10px] text-(--color-fg-dim) line-through tabular-nums">
                ₹{product.mrp_inr}
              </span>
            ) : null}
          </div>
          <AddToBasketButton slug={product.slug} name={product.name} size="icon" />
        </div>
      </div>
    </article>
  );
});

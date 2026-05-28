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

const VERDICT_SHORT: Record<VerdictId, string> = {
  daily_staple: "Staple",
  good_choice: "Good",
  occasional_treat: "Treat",
  skip: "Skip",
};

export const ProductCard = memo(function ProductCard({
  product,
  goalFit,
  hrefQuery = "",
  onSublabelClick: _onSublabelClick,
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
    <article className="group flex h-full flex-col">
      {/* image — verdict label as floating chip on top-left, score on top-right */}
      <Link
        href={href}
        className="relative block aspect-square overflow-hidden rounded-2xl photo-frame transition-transform duration-200 ease-out group-hover:-translate-y-0.5"
        onClick={() => saveCatalogReturnUrl(`/search${hrefQuery}`)}
      >
        {thumb ? (
          <Image
            src={thumb}
            alt={displayName}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-contain p-3 transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-(--color-fg-dim)">
            No image
          </div>
        )}

        {/* verdict pill, top-left */}
        {verdict && vc ? (
          <span
            className="absolute left-2.5 top-2.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-tight"
            style={{
              backgroundColor: vc.bg,
              color: vc.fg,
              borderColor: vc.border,
            }}
          >
            {VERDICT_SHORT[verdict]}
          </span>
        ) : null}

        {/* score badge, top-right (subtle, not screaming) */}
        {goalFit != null ? (
          <div className="absolute right-2 top-2">
            <GoalFitBadge fit={goalFit} />
          </div>
        ) : core ? (
          <div className="absolute right-2 top-2">
            <ScoreBadge score={core.score} grade={core.grade} verdict={verdict} />
          </div>
        ) : null}
      </Link>

      {/* content */}
      <div className="mt-3 flex flex-1 flex-col gap-1.5 px-0.5">
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
          <h3 className="line-clamp-2 mt-0.5 text-[13.5px] font-medium leading-snug text-(--color-fg) group-hover:underline group-hover:underline-offset-2">
            {displayName}
          </h3>

          {/* chips — subtle, monochrome, no verdict color */}
          {chipLabels.length > 0 ? (
            <p className="mt-1.5 truncate text-[11px] text-(--color-fg-muted)">
              {chipLabels.slice(0, 2).join(" · ")}
              {chipLabels.length > 2 ? ` · +${chipLabels.length - 2}` : ""}
            </p>
          ) : null}
        </Link>

        {/* price row */}
        <div className="flex items-center justify-between gap-2 pt-1.5">
          <div className="min-w-0">
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

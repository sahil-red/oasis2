import Image from "next/image";
import Link from "next/link";
import { AddToBasketButton } from "@/components/add-to-basket-button";
import { saveCatalogReturnUrl } from "@/components/catalog-back-link";
import { GoalFitBadge, ScoreBadge } from "@/components/score-display";
import type { CatalogGridItem, ProductListItem } from "@/lib/products/queries";
import { displayPriceInr, showMrpStrike } from "@/lib/products/display-price";

export function ProductCard({
  product,
  goalFit,
  hrefQuery = "",
}: {
  product: ProductListItem | CatalogGridItem;
  /** When set, show goal-fit instead of Core score */
  goalFit?: number;
  /** Catalog filter query string to preserve on PDP navigation */
  hrefQuery?: string;
}) {
  const thumb = product.image_urls[0];
  const core = product.core_scores;
  const price = displayPriceInr(product);
  const href = `/product/${product.slug}${hrefQuery}`;

  return (
    <article className="group">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-(--color-bg-soft)">
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
              alt={product.name}
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
        <div className="pointer-events-none absolute inset-0 z-[1] rounded-xl ring-1 ring-transparent transition group-hover:ring-(--color-line)" />
        <div className="absolute bottom-2 left-2 z-10">
          <AddToBasketButton slug={product.slug} name={product.name} size="icon" />
        </div>
        {goalFit != null ? (
          <div className="absolute right-1.5 top-1.5 z-10">
            <GoalFitBadge fit={goalFit} />
          </div>
        ) : core ? (
          <div className="absolute right-1.5 top-1.5 z-10">
            <ScoreBadge score={core.score} grade={core.grade} />
          </div>
        ) : null}
      </div>

      <Link
        href={href}
        className="mt-2.5 block space-y-1"
        onClick={() => saveCatalogReturnUrl(`/search${hrefQuery}`)}
      >
        {product.brand ? (
          <p className="truncate text-[11px] uppercase tracking-[0.12em] text-(--color-fg-dim)">
            {product.brand}
          </p>
        ) : null}
        <h3 className="line-clamp-2 text-[15px] font-medium leading-snug text-(--color-fg) group-hover:text-(--color-accent)">
          {product.name}
        </h3>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-0.5">
          {price != null ? (
            <span className="text-[15px] font-semibold tabular-nums tracking-tight text-(--color-fg)">
              ₹{price}
            </span>
          ) : null}
          {product.net_weight ? (
            <span className="text-xs text-(--color-fg-dim) tabular-nums">
              {product.net_weight}
            </span>
          ) : null}
          {showMrpStrike(product) ? (
            <span className="text-xs text-(--color-fg-dim) line-through tabular-nums">
              ₹{product.mrp_inr}
            </span>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

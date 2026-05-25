import Image from "next/image";
import Link from "next/link";
import { AddToBasketButton } from "@/components/add-to-basket-button";
import { AnalysisGrid } from "@/components/analysis-grid";
import { ScoreBadge } from "@/components/score-display";
import { buildAnalysisHighlights } from "@/lib/products/analysis";
import type { ProductListItem } from "@/lib/products/queries";
import type { SubScores } from "@/lib/supabase/types";

export function ProductCard({
  product,
  goalFit,
}: {
  product: ProductListItem;
  /** When set, show goal-fit instead of Core score */
  goalFit?: number;
}) {
  const thumb = product.image_urls[0];
  const core = product.core_scores;
  const subscores = core?.subscores as SubScores | undefined;
  const highlights = buildAnalysisHighlights(
    product.nutrition,
    product.ingredients_raw,
    subscores,
    3,
  );

  return (
    <article className="group">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-(--color-bg-soft)">
        <Link
          href={`/product/${product.slug}`}
          className="absolute inset-0 z-0 block"
          tabIndex={-1}
          aria-hidden
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
            <span
              className="font-display text-[32px] font-semibold leading-none tabular-nums text-(--color-accent)"
              title="Goal fit"
            >
              {goalFit}
            </span>
          </div>
        ) : core ? (
          <div className="absolute right-1.5 top-1.5 z-10">
            <ScoreBadge score={core.score} grade={core.grade} />
          </div>
        ) : null}
      </div>

      <Link href={`/product/${product.slug}`} className="mt-2.5 block space-y-1">
        {product.brand ? (
          <p className="truncate text-[11px] uppercase tracking-[0.12em] text-(--color-fg-dim)">
            {product.brand}
          </p>
        ) : null}
        <h3 className="line-clamp-2 text-[15px] font-medium leading-snug text-(--color-fg) group-hover:text-(--color-accent)">
          {product.name}
        </h3>
        {highlights.length > 0 ? (
          <AnalysisGrid highlights={highlights} compact />
        ) : null}
        <div className="flex items-baseline gap-2 pt-0.5">
          {product.price_inr != null ? (
            <span className="text-[15px] font-semibold tabular-nums tracking-tight text-(--color-fg)">
              ₹{product.price_inr}
            </span>
          ) : null}
          {product.mrp_inr != null &&
          product.price_inr != null &&
          product.mrp_inr > product.price_inr ? (
            <span className="text-xs text-(--color-fg-dim) line-through tabular-nums">
              ₹{product.mrp_inr}
            </span>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

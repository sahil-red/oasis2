import Image from "next/image";
import Link from "next/link";
import { AnalysisGrid } from "@/components/analysis-grid";
import { ScoreBadge } from "@/components/score-display";
import { buildAnalysisHighlights } from "@/lib/products/analysis";
import type { ProductListItem } from "@/lib/products/queries";
import type { SubScores } from "@/lib/supabase/types";

export function ProductCard({ product }: { product: ProductListItem }) {
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
    <Link
      href={`/product/${product.slug}`}
      className="panel group flex flex-col overflow-hidden rounded-xl transition hover:border-(--color-line-strong) hover:shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
    >
      <div className="relative aspect-[4/5] bg-(--color-bg-soft)">
        {thumb ? (
          <Image
            src={thumb}
            alt={product.name}
            fill
            className="object-contain p-5 transition duration-300 group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 50vw, 20vw"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-(--color-fg-dim)">
            No image
          </div>
        )}
        <div className="absolute left-3 top-3">
          {core ? (
            <ScoreBadge score={core.score} grade={core.grade} band={core.band} />
          ) : (
            <span className="rounded-full bg-(--color-bg)/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-(--color-fg-muted) ring-1 ring-(--color-line) backdrop-blur">
              Unscored
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {product.brand ? (
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-(--color-fg-dim)">
            {product.brand}
          </p>
        ) : null}
        <h3 className="line-clamp-2 text-[15px] font-medium leading-snug text-(--color-fg) group-hover:text-white">
          {product.name}
        </h3>
        <p className="line-clamp-1 text-xs text-(--color-fg-dim)">
          {[product.category, product.subcategory].filter(Boolean).join(" · ")}
        </p>
        {highlights.length > 0 ? <AnalysisGrid highlights={highlights} compact /> : null}
        <div className="mt-auto flex items-baseline justify-between pt-2">
          {product.price_inr != null ? (
            <span className="text-base font-semibold tabular-nums">₹{product.price_inr}</span>
          ) : (
            <span />
          )}
          {product.mrp_inr != null && product.price_inr != null && product.mrp_inr > product.price_inr ? (
            <span className="text-xs text-(--color-fg-dim) line-through">₹{product.mrp_inr}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

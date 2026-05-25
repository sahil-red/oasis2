import Image from "next/image";
import Link from "next/link";
import { ScoreRing } from "@/components/score-ring";
import { labelForBand } from "@/lib/utils";
import type { ProductListItem } from "@/lib/products/queries";

export function ProductCard({ product }: { product: ProductListItem }) {
  const thumb = product.image_urls[0];
  const score = product.core_scores?.score;
  const band = product.core_scores?.band;

  return (
    <Link
      href={`/product/${product.slug}`}
      className="group glass flex flex-col overflow-hidden rounded-2xl transition hover:border-(--color-line-strong)"
    >
      <div className="relative aspect-square bg-(--color-panel)">
        {thumb ? (
          <Image
            src={thumb}
            alt={product.name}
            fill
            className="object-contain p-4 transition group-hover:scale-[1.02]"
            sizes="(max-width: 768px) 50vw, 25vw"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-(--color-fg-dim)">
            No image
          </div>
        )}
        {score != null ? (
          <div className="absolute right-3 top-3 rounded-full bg-(--color-bg)/80 p-1 backdrop-blur-sm">
            <ScoreRing score={score} size={52} stroke={5} showLabel={false} delay={0} />
            <span className="absolute inset-0 grid place-items-center font-display text-sm">
              {score}
            </span>
          </div>
        ) : (
          <span className="absolute right-3 top-3 rounded-full border border-(--color-line) bg-(--color-bg)/80 px-2 py-1 text-[10px] uppercase tracking-wider text-(--color-fg-muted)">
            Pending
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        {product.brand ? (
          <p className="text-[11px] uppercase tracking-[0.14em] text-(--color-fg-dim)">
            {product.brand}
          </p>
        ) : null}
        <h3 className="line-clamp-2 text-sm leading-snug text-(--color-fg) group-hover:text-white">
          {product.name}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-(--color-fg-muted)">
          <span className="line-clamp-1">{product.category ?? "Grocery"}</span>
          {band ? <span>{labelForBand(band)}</span> : null}
        </div>
        {product.price_inr != null ? (
          <p className="text-sm font-medium text-(--color-fg)">₹{product.price_inr}</p>
        ) : null}
      </div>
    </Link>
  );
}

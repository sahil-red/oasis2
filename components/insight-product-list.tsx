import Image from "next/image";
import Link from "next/link";
import { ScoreBadge } from "@/components/score-display";
import type { ProductListItem } from "@/lib/products/queries";

export function InsightProductList({
  products,
  meta,
}: {
  products: ProductListItem[];
  meta?: (p: ProductListItem) => string | null;
}) {
  if (!products.length) {
    return <p className="text-sm text-(--color-fg-muted)">Not enough data yet.</p>;
  }
  return (
    <ul className="divide-y divide-(--color-line) rounded-xl border border-(--color-line) bg-(--color-panel)">
      {products.map((p) => (
        <li key={p.id}>
          <Link
            href={`/product/${p.slug}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-(--color-bg-soft)"
          >
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-(--color-bg-soft)">
              {p.image_urls[0] ? (
                <Image src={p.image_urls[0]} alt="" fill className="object-contain p-0.5" unoptimized />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium">{p.name}</p>
              <p className="text-xs text-(--color-fg-dim)">
                {meta?.(p) ?? p.brand ?? p.category}
              </p>
            </div>
            {p.core_scores ? (
              <ScoreBadge score={p.core_scores.score} grade={p.core_scores.grade} />
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

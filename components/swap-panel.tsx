import Image from "next/image";
import Link from "next/link";
import { ScoreBadge } from "@/components/score-display";
import { cn } from "@/lib/utils";
import type { SwapSuggestion } from "@/lib/products/alternatives";
import type { ProductListItem } from "@/lib/products/queries";

export function SwapPanel({
  current,
  suggestions,
  compact,
}: {
  current: ProductListItem;
  suggestions: SwapSuggestion[];
  compact?: boolean;
}) {
  const curSugar =
    current.nutrition?.sugar_g_100g ?? current.nutrition?.added_sugar_g_100g;

  return (
    <section
      className={cn(
        "h-full rounded-xl border border-(--color-line) bg-(--color-bg-soft)",
        compact ? "p-4" : "rounded-2xl p-6",
      )}
    >
      <h2
        className={cn(
          "font-display text-(--color-fg)",
          compact ? "text-base" : "text-2xl",
        )}
      >
        Swaps
      </h2>
      <p
        className={cn(
          "leading-relaxed text-(--color-fg-muted)",
          compact ? "mt-1 text-xs line-clamp-2" : "mt-2 text-sm",
        )}
      >
        {curSugar != null ? (
          <>
            <strong className="text-(--color-fg)">{curSugar}g sugar</strong>/100g — better picks in
            this aisle.
          </>
        ) : (
          <>Same aisle, better Core or goal fit.</>
        )}
      </p>

      {suggestions.length === 0 ? (
        <p className={cn("text-(--color-fg-dim)", compact ? "mt-2 text-xs" : "mt-4 text-sm")}>
          No stronger alternatives in catalog yet.
        </p>
      ) : (
        <ul className={cn(compact ? "mt-3 space-y-2" : "mt-5 space-y-3")}>
          {suggestions.map(({ product, goalFit, deltas }) => (
            <li key={product.id}>
              <Link
                href={`/product/${product.slug}`}
                className={cn(
                  "flex gap-2 rounded-lg border border-(--color-line) bg-white transition hover:border-(--color-accent)",
                  compact ? "p-2" : "gap-3 rounded-xl p-3",
                )}
              >
                <div
                  className={cn(
                    "relative shrink-0 overflow-hidden rounded-lg bg-(--color-bg-soft)",
                    compact ? "h-11 w-11" : "h-16 w-16",
                  )}
                >
                  {product.image_urls[0] ? (
                    <Image
                      src={product.image_urls[0]}
                      alt=""
                      fill
                      className="object-contain p-1"
                      unoptimized
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-(--color-fg)">
                    {product.name}
                  </p>
                  <p className="mt-1 text-xs text-(--color-fg-dim)">
                    {deltas.join(" · ")}
                  </p>
                  {product.price_inr != null ? (
                    <p className="mt-1 text-sm font-semibold tabular-nums">₹{product.price_inr}</p>
                  ) : null}
                </div>
                {product.core_scores ? (
                  <ScoreBadge
                    score={product.core_scores.score}
                    grade={product.core_scores.grade}
                  />
                ) : (
                  <span className="text-xs text-(--color-fg-dim)">Fit {goalFit}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

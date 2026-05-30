import Image from "next/image";
import Link from "next/link";
import { GoalFitBadge, ScoreBadge } from "@/components/score-display";
import type { GoalId } from "@/lib/goals/types";
import { cn } from "@/lib/utils";
import type { SwapSuggestion } from "@/lib/products/alternatives";
import type { ProductListItem } from "@/lib/products/queries";

export function SwapPanel({
  current,
  suggestions,
  compact,
  goal = "balanced",
}: {
  current: ProductListItem;
  suggestions: SwapSuggestion[];
  compact?: boolean;
  goal?: GoalId;
}) {
  if (suggestions.length === 0) return null;

  const curSugar =
    current.nutrition?.sugar_g_100g ?? current.nutrition?.added_sugar_g_100g;

  return (
    <section
      className={cn(
        "rounded-xl border border-(--color-line) bg-(--color-bg-soft)",
        compact ? "p-3" : "rounded-2xl p-6",
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
            Lower sugar & better macros in{" "}
            <strong className="text-(--color-fg)">{current.subcategory ?? "this aisle"}</strong>
            {current.brand ? (
              <>
                {" "}
                — not just more <span className="text-(--color-fg)">{current.brand}</span>
              </>
            ) : null}
            .
          </>
        ) : (
          <>Alternatives with better nutrition or Core score — varied brands.</>
        )}
      </p>

      <ul className={cn(compact ? "mt-3 space-y-2" : "mt-5 space-y-3")}>
        {suggestions.map(({ product, goalFit, deltas }) => (
          <li key={product.id}>
            <Link
              href={`/product/${product.slug}`}
              className={cn(
                "flex gap-2 rounded-lg border border-(--color-line) bg-(--color-panel) transition hover:border-(--color-accent)",
                compact ? "p-2" : "gap-3 rounded-xl p-3",
              )}
            >
              <div
                className={cn(
                  "relative shrink-0 overflow-hidden rounded-lg bg-[#1a1a1a] shadow-[inset_0_0_16px_rgba(0,0,0,0.4)]",
                  compact ? "h-11 w-11" : "h-16 w-16",
                )}
              >
                {product.image_urls[0] ? (
                  <Image
                    src={product.image_urls[0]}
                    alt=""
                    fill
                    className="object-contain p-1"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                {product.brand ? (
                  <p className="text-[10px] uppercase tracking-wider text-(--color-fg-dim)">
                    {product.brand}
                  </p>
                ) : null}
                <p className="line-clamp-2 text-[13px] font-medium leading-snug text-(--color-fg)">
                  {product.name}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-(--color-fg-dim)">
                  {deltas.join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                {goal !== "balanced" ? (
                  <GoalFitBadge fit={goalFit} size="sm" />
                ) : product.core_scores ? (
                  <ScoreBadge
                    score={product.core_scores.score}
                    grade={product.core_scores.grade}
                    className="!text-2xl"
                  />
                ) : (
                  <GoalFitBadge fit={goalFit} size="sm" />
                )}
                {product.price_inr != null ? (
                  <span className="text-[11px] font-semibold tabular-nums text-(--color-fg-muted)">
                    ₹{product.price_inr}
                  </span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

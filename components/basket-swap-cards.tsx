"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeftRight, Sparkles } from "lucide-react";
import { useState } from "react";
import { GoalFitBadge, ScoreBadge } from "@/components/score-display";
import { replaceInBasket } from "@/lib/basket/storage";
import type { GoalId } from "@/lib/goals/types";
import type { SwapSuggestion } from "@/lib/products/alternatives";
import type { ProductListItem } from "@/lib/products/queries";
import { cn } from "@/lib/utils";

export function BasketSwapCards({
  current,
  suggestions,
  goal,
}: {
  current: ProductListItem;
  suggestions: SwapSuggestion[];
  goal: GoalId;
}) {
  const [replacing, setReplacing] = useState<string | null>(null);

  if (!suggestions.length) return null;

  const aisle = current.subcategory ?? current.category ?? "this aisle";

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-(--color-good)/30 bg-(--color-good)/[0.04] p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-(--color-good)">
            <Sparkles className="h-3.5 w-3.5" />
            Better picks
          </p>
          <p className="mt-1 text-sm leading-relaxed text-(--color-fg-muted)">
            Same-aisle swaps in <span className="font-medium text-(--color-fg)">{aisle}</span>.
            Replace the weak line without rebuilding your cart.
          </p>
        </div>
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {suggestions.map(({ product, goalFit, deltas }) => (
          <li
            key={product.id}
            className="flex flex-col overflow-hidden rounded-xl border border-(--color-good)/20 bg-(--color-panel) shadow-sm transition hover:border-(--color-good)/40 hover:shadow-md"
          >
            <Link
              href={`/product/${product.slug}`}
              className="group relative aspect-[5/4] bg-(--color-bg-soft)"
            >
              {product.image_urls[0] ? (
                <Image
                  src={product.image_urls[0]}
                  alt={product.name}
                  fill
                  className="object-contain p-3 transition duration-300 group-hover:scale-[1.02]"
                  sizes="200px"
                />
              ) : null}
              <div className="absolute right-2 top-2 rounded-lg bg-(--color-panel)/95 px-1 py-0.5 shadow-sm">
                {goal !== "balanced" && product.core_scores ? (
                  <GoalFitBadge fit={goalFit} size="sm" />
                ) : product.core_scores ? (
                  <ScoreBadge
                    score={product.core_scores.score}
                    grade={product.core_scores.grade}
                    className="!text-xl"
                  />
                ) : (
                  <GoalFitBadge fit={goalFit} size="sm" />
                )}
              </div>
            </Link>
            <div className="flex flex-1 flex-col p-3">
              {product.brand ? (
                <p className="text-[10px] uppercase tracking-wider text-(--color-fg-dim)">
                  {product.brand}
                </p>
              ) : null}
              <Link
                href={`/product/${product.slug}`}
                className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug text-(--color-fg) hover:text-(--color-accent)"
              >
                {product.name}
              </Link>
              <p className="mt-1.5 flex-1 text-[12px] leading-snug text-(--color-fg-muted)">
                {deltas.length > 0
                  ? `Why: ${deltas.join(" · ")}`
                  : "A stronger same-aisle pick for this goal."}
              </p>
              {product.price_inr != null ? (
                <p className="mt-2 text-sm font-semibold tabular-nums">₹{product.price_inr}</p>
              ) : null}
              <button
                type="button"
                disabled={replacing === product.slug}
                onClick={() => {
                  setReplacing(product.slug);
                  replaceInBasket(current.slug, product.slug, product.name);
                  window.setTimeout(() => setReplacing(null), 400);
                }}
                className={cn(
                  "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-(--color-fg) px-3 py-2.5 text-sm font-medium text-(--color-bg) transition hover:opacity-90 disabled:opacity-60",
                )}
              >
                <ArrowLeftRight className="h-4 w-4" />
                {replacing === product.slug ? "Replacing…" : "Replace in cart"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

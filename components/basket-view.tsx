"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BasketSwapCards } from "@/components/basket-swap-cards";
import { ScoreBadge } from "@/components/score-display";
import { readStoredGoal } from "@/lib/goals/storage";
import type { GoalId } from "@/lib/goals/types";
import { analyzeBasket } from "@/lib/products/basket-analysis";
import type { SwapSuggestion } from "@/lib/products/alternatives";
import { colorForScore } from "@/lib/utils";
import {
  addToBasket,
  clearBasket,
  decrementBasket,
  readBasket,
  removeFromBasket,
} from "@/lib/basket/storage";
import type { ProductListItem } from "@/lib/products/queries";
import { cn } from "@/lib/utils";

function MetricBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number | null;
  max: number;
  tone: "good" | "warn" | "neutral";
}) {
  const pct = value != null ? Math.min(100, (value / max) * 100) : 0;
  const bar =
    tone === "good"
      ? "bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500"
        : "bg-(--color-fg)";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-(--color-fg-muted)">{label}</span>
        <span className="font-medium tabular-nums text-(--color-fg)">
          {value != null ? value.toFixed(value < 10 ? 1 : 0) : "—"}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-(--color-line)">
        <div
          className={cn("h-full rounded-full transition-all duration-500", bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function BasketView() {
  const [entries, setEntries] = useState<ReturnType<typeof readBasket>>([]);
  const [catalog, setCatalog] = useState<ProductListItem[]>([]);
  const [swapsBySlug, setSwapsBySlug] = useState<Record<string, SwapSuggestion[]>>({});
  const [swapsLoading, setSwapsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState<GoalId>("balanced");

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const next = readBasket();
      setEntries(next);
      const slugs = [...new Set(next.map((e) => e.slug))];
      if (!slugs.length) {
        if (!cancelled) {
          setCatalog([]);
          setSwapsBySlug({});
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/products?slugs=${slugs.map(encodeURIComponent).join(",")}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as ProductListItem[];
        if (!cancelled) setCatalog(data);
      } catch {
        if (!cancelled) setCatalog([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const syncGoal = () => setGoal(readStoredGoal());
    syncGoal();
    sync();
    window.addEventListener("oasis-basket", sync);
    window.addEventListener("oasis-goal", syncGoal);
    return () => {
      cancelled = true;
      window.removeEventListener("oasis-basket", sync);
      window.removeEventListener("oasis-goal", syncGoal);
    };
  }, []);

  const slugsKey = useMemo(
    () => [...new Set(entries.map((e) => e.slug))].sort().join(","),
    [entries],
  );

  useEffect(() => {
    if (!slugsKey) {
      setSwapsBySlug({});
      return;
    }
    let cancelled = false;
    setSwapsLoading(true);
    fetch(`/api/swaps?slugs=${encodeURIComponent(slugsKey)}&goal=${goal}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { swaps: Record<string, SwapSuggestion[]> }) => {
        if (!cancelled) setSwapsBySlug(data.swaps ?? {});
      })
      .catch(() => {
        if (!cancelled) setSwapsBySlug({});
      })
      .finally(() => {
        if (!cancelled) setSwapsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slugsKey, goal]);

  const lines = useMemo(() => {
    const bySlug = new Map(catalog.map((p) => [p.slug, p]));
    return entries
      .map((e) => {
        const product = bySlug.get(e.slug);
        return product ? { product, qty: e.qty } : null;
      })
      .filter(Boolean) as { product: ProductListItem; qty: number }[];
  }, [entries, catalog]);

  const analysis = useMemo(() => analyzeBasket(lines, goal), [lines, goal]);
  const headlineScore = analysis.avgGoalFit ?? analysis.avgCoreScore;
  const swapCount = Object.values(swapsBySlug).reduce((n, s) => n + s.length, 0);

  if (loading && entries.length > 0) {
    return (
      <div className="rounded-2xl border border-(--color-line) bg-(--color-bg-soft) px-6 py-12 text-center text-sm text-(--color-fg-muted)">
        Loading cart…
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-emerald-50 px-8 py-20 text-center">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-400/15 blur-3xl" />
        <Sparkles className="mx-auto h-8 w-8 text-violet-600" strokeWidth={1.5} />
        <p className="mt-4 text-lg font-medium text-(--color-fg)">Your cart is empty</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-(--color-fg-muted)">
          Add items from the catalog — we&apos;ll show same-aisle swaps and one-tap replacements
          here, like on Insights.
        </p>
        <Link
          href="/search"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-(--color-fg) px-5 py-2.5 text-sm font-medium text-(--color-bg) hover:opacity-90"
        >
          Browse catalog
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  const scoreTone = headlineScore == null ? "text-(--color-fg-dim)" : "";

  const summaryLines = [
    ...analysis.summary,
    ...(analysis.flaggedAdditiveSkus > 0
      ? [
          `${analysis.flaggedAdditiveSkus} item${analysis.flaggedAdditiveSkus === 1 ? "" : "s"} with flagged additives.`,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-emerald-50 px-5 py-5 sm:px-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-800/80">
              Cart · {analysis.goalLabel}
            </p>
            <p className="mt-1 font-display text-3xl tabular-nums sm:text-4xl">
              {analysis.totalInr > 0 ? `₹${analysis.totalInr}` : "—"}
            </p>
            <p className="mt-0.5 text-sm text-(--color-fg-muted)">
              {analysis.itemCount} item{analysis.itemCount === 1 ? "" : "s"}
              {swapsLoading
                ? " · finding swaps…"
                : swapCount > 0
                  ? ` · ${swapCount} swap${swapCount === 1 ? "" : "s"} ready`
                  : ""}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[10px] uppercase tracking-wider text-(--color-fg-dim)">
              {goal !== "balanced" ? `Avg · ${analysis.goalLabel}` : "Avg score"}
            </p>
            <p
              className={cn("font-display text-5xl leading-none tabular-nums", scoreTone)}
              style={
                headlineScore != null ? { color: colorForScore(headlineScore) } : undefined
              }
            >
              {headlineScore?.toFixed(0) ?? "—"}
            </p>
          </div>
        </div>
        {summaryLines.length > 0 ? (
          <ul className="relative mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-violet-200/60 pt-3 text-[13px] leading-snug text-(--color-fg-muted)">
            {summaryLines.map((s) => (
              <li key={s} className="flex gap-1.5">
                <span className="text-violet-500">·</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/50 to-white px-4 py-4 sm:px-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricBar
            label="Protein share"
            value={analysis.proteinPct}
            max={40}
            tone="good"
          />
          <MetricBar
            label="Avg sugar / 100g"
            value={analysis.avgSugarG}
            max={25}
            tone={analysis.avgSugarG != null && analysis.avgSugarG > 12 ? "warn" : "neutral"}
          />
          <MetricBar
            label="Snack-style %"
            value={analysis.snackHeavyPct}
            max={100}
            tone={
              analysis.snackHeavyPct != null && analysis.snackHeavyPct > 30 ? "warn" : "good"
            }
          />
        </div>
        {analysis.avgFiberG != null ? (
          <p className="mt-2 text-[11px] text-(--color-fg-dim)">
            Avg fibre ~{analysis.avgFiberG.toFixed(1)}g / 100g
          </p>
        ) : null}
      </div>

      <div className="space-y-5">
        {lines.map(({ product, qty }) => (
          <article
            key={product.id}
            className="rounded-xl border border-(--color-line) bg-white p-3 shadow-sm sm:p-4"
          >
            <div className="flex items-center gap-4">
              <Link
                href={`/product/${product.slug}`}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-(--color-line) bg-(--color-bg-soft) sm:h-24 sm:w-24"
              >
                {product.image_urls[0] ? (
                  <Image
                    src={product.image_urls[0]}
                    alt=""
                    fill
                    className="object-contain p-2"
                    unoptimized
                  />
                ) : null}
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/product/${product.slug}`}
                  className="line-clamp-2 text-[15px] font-medium leading-snug hover:text-(--color-accent) sm:text-base"
                >
                  {product.name}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-(--color-fg-dim)">
                  {product.price_inr != null ? (
                    <span className="font-semibold tabular-nums text-(--color-fg)">
                      ₹{product.price_inr * qty}
                    </span>
                  ) : null}
                  {product.core_scores ? (
                    <ScoreBadge
                      score={product.core_scores.score}
                      grade={product.core_scores.grade}
                    />
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-(--color-line) bg-(--color-bg-soft) p-1">
                <button
                  type="button"
                  aria-label="Remove one"
                  onClick={() => decrementBasket(product.slug)}
                  className="grid h-8 w-8 place-items-center rounded-full hover:bg-white"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[1.5rem] text-center text-sm font-semibold tabular-nums">
                  {qty}
                </span>
                <button
                  type="button"
                  aria-label="Add one"
                  onClick={() => addToBasket(product.slug, product.name)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-(--color-fg) text-(--color-bg) hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                aria-label="Remove from cart"
                onClick={() => removeFromBasket(product.slug)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-(--color-fg-dim) hover:bg-red-50 hover:text-(--color-bad)"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <BasketSwapCards
              current={product}
              suggestions={swapsBySlug[product.slug] ?? []}
              goal={goal}
            />
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-(--color-line) pt-6">
        <button
          type="button"
          onClick={() => clearBasket()}
          className="text-sm text-(--color-fg-dim) hover:text-(--color-fg)"
        >
          Clear cart
        </button>
        <p className="text-xs text-(--color-fg-dim)">
          Saved in your browser only — swaps use our catalog.
        </p>
      </div>
    </div>
  );
}

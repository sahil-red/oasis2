"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BasketSwapCards } from "@/components/basket-swap-cards";
import { DietPicker } from "@/components/diet-picker";
import { GoalModePicker } from "@/components/goal-mode-picker";
import { GoalFitBadge, ScoreBadge } from "@/components/score-display";
import { readStoredGoal, writeStoredGoal } from "@/lib/goals/storage";
import { readDietMode, writeDietMode } from "@/lib/diet/storage";
import { computeGoalFit, goalFitInputs } from "@/lib/goals/fit";
import type { GoalId } from "@/lib/goals/types";
import type { DietMode } from "@/lib/diet/types";
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
  const [fetchFailed, setFetchFailed] = useState(false);
  const [goal, setGoal] = useState<GoalId>("balanced");
  const [diet, setDiet] = useState<DietMode>("any");

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
          setFetchFailed(false);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setFetchFailed(false);
      try {
        const res = await fetch(`/api/products?slugs=${slugs.map(encodeURIComponent).join(",")}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as ProductListItem[];
        if (!cancelled) setCatalog(data);
      } catch {
        if (!cancelled) {
          setCatalog([]);
          setFetchFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const syncGoal = () => {
      setGoal(readStoredGoal());
      setDiet(readDietMode());
    };
    syncGoal();
    sync();
    window.addEventListener("scout-basket", sync);
    window.addEventListener("scout-goal", syncGoal);
    window.addEventListener("scout-diet", syncGoal);
    return () => {
      cancelled = true;
      window.removeEventListener("scout-basket", sync);
      window.removeEventListener("scout-goal", syncGoal);
      window.removeEventListener("scout-diet", syncGoal);
    };
  }, []);

  const pickGoal = (next: GoalId) => {
    writeStoredGoal(next);
    setGoal(next);
  };

  const pickDiet = (next: DietMode) => {
    writeDietMode(next);
    setDiet(next);
  };

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
    const dietQ = diet !== "any" ? `&diet=${diet}` : "";
    fetch(`/api/swaps?slugs=${encodeURIComponent(slugsKey)}&goal=${goal}${dietQ}`)
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
  }, [slugsKey, goal, diet]);

  const lines = useMemo(() => {
    const bySlug = new Map(catalog.map((p) => [p.slug, p]));
    return entries
      .map((e) => {
        const product = bySlug.get(e.slug);
        return product ? { product, qty: e.qty } : null;
      })
      .filter(Boolean) as { product: ProductListItem; qty: number }[];
  }, [entries, catalog]);

  const unresolvedEntries = useMemo(() => {
    const loaded = new Set(catalog.map((p) => p.slug));
    return entries.filter((e) => !loaded.has(e.slug));
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
    const hasStoredItems = entries.length > 0;

    return (
      <div className="relative overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-emerald-50 px-8 py-20 text-center dark:border-violet-800/50 dark:from-violet-950/35 dark:via-(--color-panel) dark:to-emerald-950/25">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-violet-400/15 blur-3xl dark:bg-violet-500/10" />
        <Sparkles
          className="mx-auto h-8 w-8 text-violet-600 dark:text-violet-300"
          strokeWidth={1.5}
        />
        {hasStoredItems ? (
          <>
            <p className="mt-4 text-lg font-medium text-(--color-fg)">
              {fetchFailed ? "Couldn\u2019t load your cart" : "Some items couldn\u2019t be loaded"}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-(--color-fg-muted)">
              {fetchFailed
                ? "We saved your cart locally but couldn\u2019t reach the catalog. Check your connection and try again."
                : `${unresolvedEntries.length} saved item${unresolvedEntries.length === 1 ? "" : "s"} no longer match our catalog.`}
            </p>
            {unresolvedEntries.length > 0 && !fetchFailed ? (
              <ul className="mx-auto mt-6 max-w-md space-y-2 text-left">
                {unresolvedEntries.map((e) => (
                  <li
                    key={e.slug}
                    className="flex items-center justify-between gap-3 rounded-xl border border-(--color-line) bg-(--color-panel)/80 px-4 py-3"
                  >
                    <span className="min-w-0 truncate text-sm text-(--color-fg)">
                      {e.name ?? e.slug}
                      {e.qty > 1 ? ` × ${e.qty}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFromBasket(e.slug)}
                      className="shrink-0 text-sm text-(--color-fg-dim) hover:text-(--color-bad)"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {fetchFailed ? (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event("scout-basket"))}
                  className="inline-flex items-center gap-2 rounded-full bg-(--color-fg) px-5 py-2.5 text-sm font-medium text-(--color-bg) hover:opacity-90"
                >
                  Retry
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => clearBasket()}
                className="inline-flex items-center gap-2 rounded-full border border-(--color-line) px-5 py-2.5 text-sm font-medium text-(--color-fg) hover:bg-(--color-bg-soft)"
              >
                Clear cart
              </button>
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    );
  }

  const scoreTone = headlineScore == null ? "text-(--color-fg-dim)" : "";

  const summaryLines = [
    ...analysis.summary,
    ...(analysis.flaggedAdditiveSkus > 0 && !analysis.summary.some((s) => /flagged additives/i.test(s))
      ? [
          `${analysis.flaggedAdditiveSkus} item${analysis.flaggedAdditiveSkus === 1 ? "" : "s"} with flagged additives.`,
        ]
      : []),
  ];

  const primarySummary = summaryLines[0] ?? "Cart analysis is ready.";
  const watchSummary =
    summaryLines.find((s) => /sugar|additive|below|swap|low side|snack/i.test(s)) ??
    "No urgent red flags in this cart.";
  const improveSummary =
    swapCount > 0
      ? `${swapCount} better pick${swapCount === 1 ? "" : "s"} ready to replace.`
      : "Add a few more items and we’ll find stronger swaps.";

  const itemFit = (product: ProductListItem) =>
    goal === "balanced" ? null : computeGoalFit(goal, goalFitInputs(product));

  return (
    <div className="space-y-5">
      {unresolvedEntries.length > 0 ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">
            {unresolvedEntries.length} saved item{unresolvedEntries.length === 1 ? "" : "s"}{" "}
            couldn&apos;t be loaded
          </p>
          <ul className="mt-2 space-y-1">
            {unresolvedEntries.map((e) => (
              <li key={e.slug} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-amber-900/90 dark:text-amber-200/90">
                  {e.name}
                  {e.qty > 1 ? ` × ${e.qty}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => removeFromBasket(e.slug)}
                  className="shrink-0 text-xs text-amber-800/80 hover:text-(--color-bad) dark:text-amber-300/80"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-emerald-50 px-5 py-5 sm:px-6 dark:border-violet-800/50 dark:from-violet-950/35 dark:via-(--color-panel) dark:to-emerald-950/25">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/10" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-800/80 dark:text-violet-300/80">
              Cart verdict · {analysis.goalLabel}
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
            <div className="mt-4 max-w-xl space-y-2">
              <GoalModePicker value={goal} onChange={pickGoal} compact />
              <DietPicker value={diet} onChange={pickDiet} compact />
            </div>
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
        <div className="relative mt-5 grid gap-2 border-t border-violet-200/60 pt-4 dark:border-violet-800/40 sm:grid-cols-3">
          {[
            ["Best move", primarySummary],
            ["Watch", watchSummary],
            ["Improve", improveSummary],
          ].map(([label, body]) => (
            <div
              key={label}
              className="rounded-xl bg-(--color-panel)/75 px-3 py-3 ring-1 ring-violet-100 dark:ring-violet-800/40"
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-violet-800/80 dark:text-violet-300/80">
                {label}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-(--color-fg-muted)">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/50 to-white px-4 py-4 dark:border-emerald-800/50 dark:from-emerald-950/30 dark:to-(--color-panel) sm:px-5">
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
        {lines.map(({ product, qty }) => {
          const fit = itemFit(product);
          return (
          <article
            key={product.id}
            className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-3 shadow-sm sm:p-4"
          >
            <div className="flex items-center gap-4">
              <Link
                href={`/product/${product.slug}`}
                className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-(--color-line) bg-(--color-bg-soft) sm:h-24 sm:w-24"
              >
                {product.image_urls[0] ? (
                  <Image
                    src={product.image_urls[0]}
                    alt={product.name}
                    fill
                    className="object-contain p-2"
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
                  {fit ? (
                    <GoalFitBadge fit={fit.fit} size="sm" />
                  ) : product.core_scores ? (
                    <ScoreBadge
                      score={product.core_scores.score}
                      grade={product.core_scores.grade}
                      className="!text-2xl"
                    />
                  ) : null}
                </div>
                <p className="mt-1 line-clamp-1 text-[12px] text-(--color-fg-muted)">
                  {fit?.shortReason ??
                    (product.core_scores ? "Based on nutrition + ingredients" : "Score pending")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-(--color-line) bg-(--color-bg-soft) p-1">
                <button
                  type="button"
                  aria-label="Remove one"
                  onClick={() => decrementBasket(product.slug)}
                  className="grid h-8 w-8 place-items-center rounded-full hover:bg-(--color-panel)"
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
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-(--color-fg-dim) hover:bg-red-50 hover:text-(--color-bad) dark:hover:bg-red-950/40"
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
          );
        })}
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

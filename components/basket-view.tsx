"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ScoreBadge } from "@/components/score-display";
import { readStoredGoal } from "@/lib/goals/storage";
import type { GoalId } from "@/lib/goals/types";
import { analyzeBasket } from "@/lib/products/basket-analysis";
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

  if (loading && entries.length > 0) {
    return (
      <div className="rounded-2xl border border-(--color-line) bg-(--color-bg-soft) px-6 py-12 text-center text-sm text-(--color-fg-muted)">
        Loading cart…
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-(--color-line) bg-linear-to-br from-(--color-bg-soft) via-white to-(--color-bg-soft) px-8 py-20 text-center">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-(--color-accent)/10 blur-3xl" />
        <Sparkles className="mx-auto h-8 w-8 text-(--color-accent)" strokeWidth={1.5} />
        <p className="mt-4 text-lg font-medium text-(--color-fg)">Your mock cart is empty</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-(--color-fg-muted)">
          Add items from the catalog with the <strong>+</strong> on each tile, then see protein
          share, sugar averages, and Core scores here.
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

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-(--color-line) bg-(--color-fg) px-6 py-8 text-(--color-bg) sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_55%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/60">Mock Blinkit cart</p>
            <p className="mt-2 font-display text-4xl tabular-nums sm:text-5xl">
              {analysis.totalInr > 0 ? `₹${analysis.totalInr}` : "—"}
            </p>
            <p className="mt-1 text-sm text-white/70">
              {analysis.itemCount} item{analysis.itemCount === 1 ? "" : "s"} · local only, no login
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-white/60">
              {goal !== "balanced" ? `Avg for ${analysis.goalLabel}` : "Avg score"}
            </p>
            <p
              className={cn("font-display text-6xl leading-none tabular-nums", scoreTone)}
              style={
                headlineScore != null ? { color: colorForScore(headlineScore) } : undefined
              }
            >
              {headlineScore?.toFixed(0) ?? "—"}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5 rounded-2xl border border-(--color-line) bg-white p-6 shadow-sm">
          <h2 className="font-display text-xl">Cart breakdown</h2>
          <MetricBar
            label="Protein share of macros"
            value={analysis.proteinPct}
            max={40}
            tone="good"
          />
          <MetricBar
            label="Avg sugar (g / 100g)"
            value={analysis.avgSugarG}
            max={25}
            tone={analysis.avgSugarG != null && analysis.avgSugarG > 12 ? "warn" : "neutral"}
          />
          <MetricBar
            label="Snack-style items"
            value={analysis.snackHeavyPct}
            max={100}
            tone={
              analysis.snackHeavyPct != null && analysis.snackHeavyPct > 30 ? "warn" : "good"
            }
          />
          {analysis.avgFiberG != null ? (
            <p className="text-xs text-(--color-fg-dim)">
              Avg fibre ~{analysis.avgFiberG.toFixed(1)}g / 100g
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-(--color-line) bg-(--color-bg-soft) p-6">
          <h2 className="font-display text-xl">What this means</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-(--color-fg-muted)">
            {analysis.summary.map((s) => (
              <li key={s} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-accent)" />
                <span>{s}</span>
              </li>
            ))}
            {analysis.flaggedAdditiveSkus > 0 ? (
              <li className="flex gap-2 text-amber-800">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <span>
                  {analysis.flaggedAdditiveSkus} item
                  {analysis.flaggedAdditiveSkus === 1 ? "" : "s"} with flagged additives.
                </span>
              </li>
            ) : null}
          </ul>
          <Link
            href="/search"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-(--color-accent) hover:underline"
          >
            Improve picks in catalog
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <ul className="space-y-3">
        {lines.map(({ product, qty }) => (
          <li
            key={product.id}
            className="flex items-center gap-4 rounded-2xl border border-(--color-line) bg-white p-4 shadow-sm transition hover:border-(--color-line-strong)"
          >
            <Link
              href={`/product/${product.slug}`}
              className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-(--color-bg-soft)"
            >
              {product.image_urls[0] ? (
                <Image
                  src={product.image_urls[0]}
                  alt=""
                  fill
                  className="object-contain p-1.5"
                  unoptimized
                />
              ) : null}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/product/${product.slug}`}
                className="line-clamp-2 font-medium leading-snug hover:text-(--color-accent)"
              >
                {product.name}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-(--color-fg-dim)">
                {product.price_inr != null ? (
                  <span className="font-semibold tabular-nums text-(--color-fg)">
                    ₹{product.price_inr * qty}
                  </span>
                ) : null}
                {product.core_scores ? (
                  <ScoreBadge score={product.core_scores.score} grade={product.core_scores.grade} />
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
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-(--color-line) pt-6">
        <button
          type="button"
          onClick={() => clearBasket()}
          className="text-sm text-(--color-fg-dim) hover:text-(--color-fg)"
        >
          Clear cart
        </button>
        <p className="text-xs text-(--color-fg-dim)">
          Not synced to Blinkit — analysis only on Oasis catalog data.
        </p>
      </div>
    </div>
  );
}

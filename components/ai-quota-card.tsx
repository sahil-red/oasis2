"use client";

import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { SCOUT_PLUS_PLAN, formatInr } from "@/lib/billing/plans";
import type { AiSearchUsage } from "@/lib/search/ai-usage";

/** Shown when a free user exhausts the daily Ask Scout quota — the single
 *  most natural upgrade moment in the app, so treat it as an invitation,
 *  not an error. */
export function AiQuotaCard({
  usage,
  onDismiss,
}: {
  usage: AiSearchUsage | null;
  onDismiss: () => void;
}) {
  const limit = usage?.limit ?? SCOUT_PLUS_PLAN.free_daily_ai_searches;
  return (
    <div
      className="relative mt-3 rounded-2xl border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--color-accent) 40%, var(--color-line))",
        backgroundColor: "color-mix(in srgb, var(--color-accent) 6%, var(--color-panel))",
      }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full text-(--color-fg-dim) hover:text-(--color-fg)"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"
          style={{
            backgroundColor: "color-mix(in srgb, var(--color-accent) 14%, var(--color-panel))",
            color: "var(--color-accent)",
          }}
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-(--color-fg)">
            That&apos;s all {limit} free Ask Scout searches for today
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-(--color-fg-muted)">
            They reset at midnight — or go unlimited with Scout Plus for{" "}
            {formatInr(SCOUT_PLUS_PLAN.amount_paise)}/month. Filters and browsing stay free, always.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 rounded-xl bg-(--color-fg) px-4 py-2 text-[13px] font-semibold text-(--color-bg) transition hover:opacity-90"
            >
              <Sparkles className="h-3.5 w-3.5" />
              See Scout Plus
            </Link>
            <button
              type="button"
              onClick={onDismiss}
              className="text-[13px] text-(--color-fg-muted) underline-offset-4 hover:text-(--color-fg) hover:underline"
            >
              Browse with filters instead
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

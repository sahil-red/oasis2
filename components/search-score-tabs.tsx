"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { catalogTierStyle } from "@/lib/scoring/verdict-display";
import type { VerdictId } from "@/lib/scoring/verdict";

type TabId = "match" | "health";

export function SearchScoreTabs({
  matchScore,
  healthScore,
  verdict,
  className,
}: {
  matchScore: number;
  healthScore?: number | null;
  verdict?: VerdictId | null;
  className?: string;
}) {
  const hasHealth = typeof healthScore === "number" && Number.isFinite(healthScore);
  const [tab, setTab] = useState<TabId>("match");

  const activeScore = tab === "health" && hasHealth ? healthScore : matchScore;
  const healthFill =
    hasHealth && tab === "health"
      ? catalogTierStyle(healthScore, verdict).fill
      : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel)/95 text-right shadow-sm backdrop-blur-md",
        className,
      )}
    >
      {hasHealth ? (
        <div
          className="grid grid-cols-2 border-b border-(--color-line)"
          role="tablist"
          aria-label="Score type"
        >
          {(
            [
              ["match", "Match"],
              ["health", "Health"],
            ] as const
          ).map(([id, label]) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setTab(id);
                }}
                className={cn(
                  "px-1.5 py-1 text-[8px] font-semibold uppercase tracking-wide transition-colors",
                  active
                    ? "bg-(--color-bg-soft) text-(--color-fg)"
                    : "text-(--color-fg-dim) hover:text-(--color-fg-muted)",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="px-2 py-1">
        {healthFill && tab === "health" ? (
          <p
            className="font-display text-xl font-bold leading-none tabular-nums text-white"
            style={{
              backgroundColor: healthFill,
              borderRadius: 8,
              padding: "4px 8px",
              display: "inline-block",
              minWidth: 36,
              textAlign: "center",
            }}
          >
            {Math.round(activeScore)}
          </p>
        ) : (
          <p className="font-display text-xl leading-none tabular-nums text-(--color-fg)">
            {Math.round(activeScore)}
          </p>
        )}
        <p className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide text-(--color-fg-dim)">
          {tab === "health" && hasHealth ? "health" : "match"}
        </p>
      </div>
    </div>
  );
}

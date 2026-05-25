"use client";

import { ScoreRing } from "@/components/score-ring";
import { cn, colorForGrade, labelForBand } from "@/lib/utils";
import type { Grade, ScoreBand, SubScores } from "@/lib/supabase/types";

const BAND_STYLES: Record<ScoreBand, string> = {
  excellent: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25",
  good: "bg-lime-500/15 text-lime-400 ring-lime-500/25",
  poor: "bg-amber-500/15 text-amber-400 ring-amber-500/25",
  bad: "bg-red-500/15 text-red-400 ring-red-500/25",
};

interface ScoreCore {
  score: number;
  grade: Grade;
  band: ScoreBand;
  subscores?: SubScores;
}

/** Compact badge for catalog cards */
export function ScoreBadge({
  score,
  grade,
  band,
  className,
}: Pick<ScoreCore, "score" | "grade" | "band"> & { className?: string }) {
  const color = colorForGrade(grade);
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full bg-(--color-bg)/90 py-1 pl-1 pr-3 ring-1 ring-inset backdrop-blur-md",
        BAND_STYLES[band],
        className,
      )}
      style={{ boxShadow: `0 0 20px ${color}22` }}
    >
      <span
        className="grid h-9 w-9 place-items-center rounded-full font-display text-lg tabular-nums"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {score}
      </span>
      <div className="text-left leading-tight">
        <div className="text-[10px] font-medium uppercase tracking-wider opacity-80">
          {labelForBand(band)}
        </div>
        <div className="text-xs font-medium">Grade {grade}</div>
      </div>
    </div>
  );
}

/** Full score block for PDP */
export function ScorePanel({
  score,
  grade,
  band,
  subscores,
  ruleVersion,
}: ScoreCore & { ruleVersion?: number }) {
  const axes = subscores
    ? [
        { label: "Nutrition", value: subscores.nutrition, max: 60 },
        { label: "Additives", value: subscores.additives, max: 30 },
        { label: "Labels", value: subscores.labels, max: 10 },
      ]
    : [];

  return (
    <div className="panel rounded-2xl p-6 md:p-8">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
        <ScoreRing score={score} size={168} stroke={10} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider ring-1 ring-inset",
                BAND_STYLES[band],
              )}
            >
              {labelForBand(band)}
            </span>
            <span className="text-sm text-(--color-fg-muted)">Grade {grade}</span>
            {ruleVersion != null ? (
              <span className="text-xs text-(--color-fg-dim)">v{ruleVersion}</span>
            ) : null}
          </div>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-(--color-fg-muted)">
            Core score combines nutrition (60%), additive concerns (30%), and label
            signals (10%). Tap ingredients below for flagged additives.
          </p>
          {axes.length > 0 ? (
            <div className="mt-6 grid grid-cols-3 gap-2">
              {axes.map(({ label, value, max }) => (
                <div
                  key={label}
                  className="rounded-xl bg-(--color-bg-soft) px-3 py-2.5 text-center ring-1 ring-(--color-line)"
                >
                  <div className="text-[10px] uppercase tracking-wider text-(--color-fg-dim)">
                    {label}
                  </div>
                  <div className="mt-1 font-display text-2xl tabular-nums text-(--color-fg)">
                    {value}
                  </div>
                  <div className="text-[10px] text-(--color-fg-dim)">/{max}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ScorePending() {
  return (
    <div className="panel rounded-2xl px-5 py-4 text-sm text-(--color-fg-muted)">
      Score pending — waiting on nutrition data.
    </div>
  );
}

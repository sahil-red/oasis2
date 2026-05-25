"use client";

import { ScoreRing } from "@/components/score-ring";
import { cn, colorForGrade, labelForBand } from "@/lib/utils";
import type { Grade, ScoreBand, SubScores } from "@/lib/supabase/types";

const BAND_STYLES: Record<ScoreBand, string> = {
  excellent: "bg-emerald-50 text-emerald-900 ring-emerald-200",
  good: "bg-lime-50 text-lime-900 ring-lime-200",
  poor: "bg-amber-50 text-amber-900 ring-amber-200",
  bad: "bg-red-50 text-red-900 ring-red-200",
};

interface ScoreCore {
  score: number;
  grade: Grade;
  band: ScoreBand;
  subscores?: SubScores;
}

/** Score on catalog cards — large number, grade color */
export function ScoreBadge({
  score,
  grade,
  className,
}: Pick<ScoreCore, "score" | "grade"> & { className?: string }) {
  const color = colorForGrade(grade);
  return (
    <span
      className={cn(
        "font-display text-[32px] font-semibold leading-none tracking-tight tabular-nums",
        "drop-shadow-[0_1px_3px_rgba(255,255,255,0.95)]",
        className,
      )}
      style={{ color }}
    >
      {score}
    </span>
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
    <div className="rounded-2xl border border-(--color-line) bg-(--color-bg-soft) p-6 md:p-8">
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
            <span className="text-sm font-medium text-(--color-fg)">Grade {grade}</span>
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
                  className="rounded-xl border border-(--color-line) bg-white px-3 py-2.5 text-center"
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
    <div className="rounded-2xl border border-(--color-line) bg-(--color-bg-soft) px-5 py-4 text-sm text-(--color-fg-muted)">
      Score pending — waiting on nutrition data.
    </div>
  );
}

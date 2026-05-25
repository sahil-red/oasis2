"use client";

import { GradeLegend } from "@/components/grade-legend";
import { ScoreRing } from "@/components/score-ring";
import {
  bandFromScore,
  cn,
  colorForGrade,
  colorForScore,
  labelForBand,
} from "@/lib/utils";
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

/** Score on catalog cards — large number, green→red by value */
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

/** Goal-mode fit (0–100) — same green→red scale as Core score */
export function GoalFitBadge({
  fit,
  className,
  size = "card",
}: {
  fit: number;
  className?: string;
  size?: "card" | "inline" | "sm";
}) {
  const color = colorForScore(fit);
  const band = bandFromScore(fit);
  const sizeClass =
    size === "card"
      ? "text-[32px]"
      : size === "sm"
        ? "text-xl"
        : "text-2xl";
  return (
    <span
      className={cn(
        "font-display font-semibold leading-none tabular-nums",
        "drop-shadow-[0_1px_3px_rgba(255,255,255,0.95)]",
        sizeClass,
        className,
      )}
      style={{ color }}
      title={labelForBand(band)}
    >
      {fit}
    </span>
  );
}

/** Compact goal fit with band chip (PDP header) */
export function GoalFitChip({ fit, label }: { fit: number; label: string }) {
  const band = bandFromScore(fit);
  const color = colorForScore(fit);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="font-display text-3xl font-semibold tabular-nums"
        style={{ color }}
      >
        {fit}
      </span>
      <span
        className={cn(
          "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
          BAND_STYLES[band],
        )}
      >
        {label}
      </span>
      <span className="text-sm text-(--color-fg-dim)">for your goal</span>
    </div>
  );
}

/** Score pillars (points earned, not raw counts) + A–F legend. */
export function ScoreSubscoresBlock({
  subscores,
  flaggedAdditiveCount = 0,
  className,
}: {
  subscores?: SubScores;
  /** Moderate + hazardous additive matches on the ingredient list. */
  flaggedAdditiveCount?: number;
  className?: string;
}) {
  if (!subscores) return null;

  const nutritionPct = Math.round((subscores.nutrition / 60) * 100);
  const additivePct = Math.round((subscores.additives / 30) * 100);
  const labelsPct = Math.round((subscores.labels / 10) * 100);

  function pillarLabel(pct: number): string {
    if (pct >= 80) return "Strong";
    if (pct >= 55) return "Fair";
    return "Low";
  }

  const pillars = [
    {
      key: "nutrition",
      title: "Nutrition",
      pct: nutritionPct,
      label: pillarLabel(nutritionPct),
      hint: "vs category baseline on the label",
    },
    {
      key: "additives",
      title: "Ingredient safety",
      pct: additivePct,
      label: pillarLabel(additivePct),
      hint:
        flaggedAdditiveCount === 0
          ? "No flagged additives on list"
          : `${flaggedAdditiveCount} flagged additive${flaggedAdditiveCount === 1 ? "" : "s"} on list`,
    },
    {
      key: "labels",
      title: "Pack signals",
      pct: labelsPct,
      label: pillarLabel(labelsPct),
      hint: "Organic, sugar claims, short list",
    },
  ];

  return (
    <details className={cn("group rounded-xl border border-(--color-line) bg-white", className)}>
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-(--color-fg)">Label breakdown</span>
          <span className="text-[12px] text-(--color-fg-dim) group-open:hidden">Nutrition · additives · pack</span>
          <span className="hidden text-[12px] text-(--color-fg-dim) group-open:inline">Hide</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-(--color-line) px-4 pb-4 pt-3">
        <dl className="space-y-3">
          {pillars.map((p) => (
            <div key={p.key}>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[13px] font-medium text-(--color-fg)">{p.title}</dt>
                <dd
                  className="text-[12px] font-medium"
                  style={{ color: colorForScore(p.pct) }}
                >
                  {p.label}
                </dd>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-(--color-bg-soft)">
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${p.pct}%`, backgroundColor: colorForScore(p.pct) }}
                />
              </div>
              <p className="mt-1 text-[11px] leading-snug text-(--color-fg-dim)">{p.hint}</p>
            </div>
          ))}
        </dl>
        <GradeLegend compact bare />
      </div>
    </details>
  );
}

/** Full score block for PDP */
export function ScorePanel({
  score,
  grade,
  band,
  subscores,
  ruleVersion,
  compact,
}: ScoreCore & { ruleVersion?: number; compact?: boolean }) {
  const axes = subscores
    ? [
        { label: "Nutrition", value: subscores.nutrition, max: 60 },
        { label: "Additives", value: subscores.additives, max: 30 },
        { label: "Labels", value: subscores.labels, max: 10 },
      ]
    : [];

  if (compact) {
    return (
      <div className="rounded-xl border border-(--color-line) bg-(--color-bg-soft) p-3">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
          Overall score
        </h2>
        <div className="mt-2 flex items-start gap-3">
          <ScoreRing
            score={score}
            size={72}
            stroke={6}
            showLabel
            subtitle={`Grade ${grade}`}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1 pt-0.5">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset",
                BAND_STYLES[band],
              )}
            >
              {labelForBand(band)}
            </span>
            {axes.length > 0 ? (
              <dl className="mt-2 grid grid-cols-3 gap-1.5">
                {axes.map(({ label, value, max }) => (
                  <div
                    key={label}
                    className="rounded-md border border-(--color-line) bg-white px-1 py-1 text-center"
                  >
                    <dt className="text-[9px] leading-tight text-(--color-fg-dim)">{label}</dt>
                    <dd className="font-display text-sm leading-none tabular-nums text-(--color-fg)">
                      {value}
                      <span className="text-[9px] font-normal text-(--color-fg-dim)">/{max}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <div className="mt-3">
              <GradeLegend compact />
            </div>
          </div>
        </div>
      </div>
    );
  }

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
          <p className="mt-3 max-w-md text-[15px] leading-relaxed text-(--color-fg-muted)">
            Based on the label: nutrition, flagged additives, and a few pack claims. See
            &quot;Why this score?&quot; below for the short version.
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
          <div className="mt-6 max-w-md">
            <GradeLegend compact />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScorePending({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-(--color-line) bg-(--color-bg-soft) text-sm text-(--color-fg-muted)",
        compact ? "flex h-full items-center px-4 py-3" : "px-5 py-4",
      )}
    >
      {compact ? "Score pending" : "Score pending — waiting on nutrition data."}
    </div>
  );
}

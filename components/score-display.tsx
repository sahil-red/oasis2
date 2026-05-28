"use client";

import { ChevronDown } from "lucide-react";
import { GradeLegend } from "@/components/grade-legend";
import {
  bandFromScore,
  cn,
  colorForScore,
  labelForBand,
} from "@/lib/utils";
import { catalogTierStyle } from "@/lib/scoring/verdict-display";
import type { VerdictId } from "@/lib/scoring/verdict";
import type { Grade, ScoreBand, SubScores } from "@/lib/supabase/types";

interface ScoreCore {
  score: number;
  grade: Grade;
  band: ScoreBand;
  subscores?: SubScores;
}

function BandChip({ band, className }: { band: ScoreBand; className?: string }) {
  return (
    <span
      data-band={band}
      className={cn(
        "score-band-chip inline-flex rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wider",
        className,
      )}
    >
      {labelForBand(band)}
    </span>
  );
}

/** Catalog card score — tier-colored bar + tint, score only (no verdict word). */
export function ScoreBadge({
  score,
  grade: _grade,
  verdict,
  className,
}: Pick<ScoreCore, "score" | "grade"> & {
  verdict?: VerdictId | null;
  className?: string;
}) {
  const { fill } = catalogTierStyle(score, verdict);
  return (
    <div
      className={cn(
        "flex h-12 min-w-12 items-center justify-center rounded-[10px] px-2.5 font-display text-[22px] font-bold leading-none tabular-nums text-white shadow-lg",
        className,
      )}
      style={{ backgroundColor: fill }}
      title={`Score ${score}`}
    >
      {score}
    </div>
  );
}

/** Goal-mode fit (0–100) — same scale as Core score */
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
    size === "card" ? "text-[28px]" : size === "sm" ? "text-xl" : "text-2xl";
  return (
    <div
      className={cn(
        "flex flex-col items-end gap-0.5 rounded-xl border border-(--color-line) bg-(--color-panel)/92 px-2 py-1 shadow-sm backdrop-blur-md",
        className,
      )}
      title={labelForBand(band)}
      style={{ boxShadow: `0 4px 14px color-mix(in srgb, ${color} 20%, transparent)` }}
    >
      <span
        className={cn("font-display font-semibold leading-none tabular-nums", sizeClass)}
        style={{ color }}
      >
        {fit}
      </span>
      <span className="text-[8px] font-medium uppercase tracking-wider text-(--color-fg-dim)">
        fit
      </span>
    </div>
  );
}

/** Compact goal fit with band chip (PDP header) */
export function GoalFitChip({ fit, label }: { fit: number; label: string }) {
  const band = bandFromScore(fit);
  const color = colorForScore(fit);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-display text-3xl font-semibold tabular-nums" style={{ color }}>
        {fit}
      </span>
      <BandChip band={band} />
      <span className="text-sm text-(--color-fg-dim)">for {label}</span>
    </div>
  );
}

/** Score pillars + A–F legend. */
export function ScoreSubscoresBlock({
  subscores,
  flaggedAdditiveCount = 0,
  className,
}: {
  subscores?: SubScores;
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
      hint:
        labelsPct >= 80
          ? "Organic, sugar claims, short list"
          : labelsPct >= 55
            ? "Some positive pack cues"
            : "Marketing claims don't match label (e.g. sugar)",
    },
  ];

  return (
    <details
      className={cn(
        "group overflow-hidden rounded-2xl border border-(--color-line) border-t-(--color-line) bg-(--color-panel) shadow-sm",
        className,
      )}
    >
      <summary className="cursor-pointer list-none border-t border-(--color-line) px-4 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-(--color-fg)">
              Label breakdown
            </span>
            <span className="mt-0.5 block text-[12px] text-(--color-fg-dim) group-open:hidden">
              Nutrition · Ingredients · Claims
            </span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-(--color-fg-dim) transition group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-3 border-t border-(--color-line) bg-(--color-bg-soft)/50 px-4 pb-4 pt-3">
        <dl className="space-y-3">
          {pillars.map((p) => (
            <div key={p.key}>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[13px] font-medium text-(--color-fg)">{p.title}</dt>
                <dd
                  className="text-[12px] font-semibold tabular-nums"
                  style={{ color: colorForScore(p.pct) }}
                >
                  {p.label}
                </dd>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-(--color-line)/40">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
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

/** Clean numeric score block — no ring, just typography. */
export function ScorePanel({
  score,
  grade,
  band,
  subscores,
  compact: _compact,
}: ScoreCore & { ruleVersion?: number; compact?: boolean }) {
  const axes = subscores
    ? [
        { label: "Nutrition", value: subscores.nutrition, max: 60 },
        { label: "Additives", value: subscores.additives, max: 30 },
        { label: "Labels", value: subscores.labels, max: 10 },
      ]
    : [];

  return (
    <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-6">
      <div className="flex items-start gap-6">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-(--color-fg-dim)">
            Score
          </p>
          <p
            className="font-display mt-2 text-6xl leading-none tabular-nums"
            style={{ color: colorForScore(score) }}
          >
            {score}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-(--color-fg-muted)">
            <BandChip band={band} />
            <span>Grade {grade}</span>
          </p>
        </div>
        {axes.length > 0 ? (
          <dl className="ml-auto grid grid-cols-3 gap-3 text-right">
            {axes.map(({ label, value, max }) => (
              <div key={label}>
                <dt className="text-[10px] uppercase tracking-wider text-(--color-fg-dim)">
                  {label}
                </dt>
                <dd className="mt-1 text-xl tabular-nums text-(--color-fg)">
                  {value}
                  <span className="text-[10px] text-(--color-fg-dim)">/{max}</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      <div className="mt-5">
        <GradeLegend compact />
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

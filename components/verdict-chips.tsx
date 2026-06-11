"use client";

import { cn } from "@/lib/utils";
import { BestInCohortChip } from "@/components/best-in-cohort-tooltip";
import {
  SUBLABEL_DESCRIPTIONS,
  type SublabelId,
} from "@/lib/scoring/sublabels";
import {
  VERDICT_COLORS,
  sublabelChipLabels,
  tierAccentForVerdict,
  verdictTitle,
} from "@/lib/scoring/verdict-display";
import type { VerdictId } from "@/lib/scoring/verdict";
import { buildAutoSentence } from "@/lib/scoring/auto-sentence";

export function VerdictBadge({
  verdict,
  className,
  size = "sm",
}: {
  verdict: VerdictId;
  className?: string;
  size?: "sm" | "md";
}) {
  const c = VERDICT_COLORS[verdict];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold tracking-tight",
        size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]",
        className,
      )}
      style={{
        backgroundColor: c.bg,
        color: c.fg,
        borderColor: c.border,
      }}
    >
      {verdictTitle(verdict)}
    </span>
  );
}

export function VerdictSublabelChips({
  sublabelIds,
  className,
  max = 3,
  verdict,
  showOverflow = false,
}: {
  sublabelIds?: string[] | null;
  className?: string;
  max?: number;
  verdict?: VerdictId | null;
  showOverflow?: boolean;
}) {
  const allLabels = sublabelChipLabels(sublabelIds);
  const labels = allLabels.slice(0, max);
  if (!labels.length) return null;

  const overflow = showOverflow ? Math.max(0, allLabels.length - max) : 0;
  const c = verdict ? VERDICT_COLORS[verdict] : null;
  const chipBorder = c?.chipBorder ?? "var(--color-line-strong)";
  const chipFg = c?.chipFg ?? "var(--color-fg-muted)";

  const idsForTooltip = (sublabelIds ?? []).slice(0, max);

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {labels.map((label, i) => {
        const id = idsForTooltip[i] as SublabelId | undefined;
        const tooltip = (id && SUBLABEL_DESCRIPTIONS[id]) || label;
        return (
          <span
            key={label}
            className="inline-flex items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-snug tracking-wide"
            style={{
              borderColor: chipBorder,
              color: chipFg,
              background: "transparent",
            }}
            title={tooltip}
          >
            {label}
          </span>
        );
      })}
      {overflow > 0 ? (
        <span className="shrink-0 rounded-full border border-(--color-line) px-1.5 py-0.5 text-[10px] font-medium text-(--color-fg-dim)">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

/** Circular score gauge — the arc fills with score/100 in the verdict color. */
export function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`Score ${score} out of 100`}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={`color-mix(in srgb, ${color} 18%, transparent)`}
          strokeWidth="5"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
        />
      </svg>
      <span
        className="absolute inset-0 grid place-items-center font-display text-[22px] font-semibold tabular-nums"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}

export function VerdictBlock({
  verdict,
  score,
  sublabelIds,
  cohortSize,
  relativeScore,
  cohortId,
  subcategory,
  productId,
  deepseekChips,
  className,
}: {
  verdict: VerdictId;
  score?: number | null;
  sublabelIds?: string[] | null;
  cohortSize?: number | null;
  relativeScore?: number | null;
  cohortId?: string | null;
  subcategory?: string | null;
  productId?: string;
  deepseekChips?: string[] | null;
  className?: string;
}) {
  const c = VERDICT_COLORS[verdict];
  const showCohort =
    cohortSize != null && cohortSize >= 8 && relativeScore != null && cohortId && productId;
  const verdictSentence = buildAutoSentence(verdict, sublabelIds, deepseekChips);

  return (
    <div
      className={cn("rounded-2xl border p-4", className)}
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <div className="flex items-start gap-4">
        {score != null ? <ScoreRing score={score} color={c.fg} /> : null}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: c.fg }}>
            {verdictTitle(verdict)}
            <span className="opacity-60"> · health score</span>
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-(--color-fg)">
            {verdictSentence}
          </p>
          {showCohort ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <BestInCohortChip
                cohortId={cohortId}
                subcategoryLabel={subcategory ?? ""}
                productId={productId}
                borderColor={c.chipBorder}
                fgColor={c.chipFg}
                labelOverride={`Better than ${relativeScore}%`}
              />
              <span className="text-[11px] leading-snug text-(--color-fg-muted)">
                of {cohortSize} {subcategory ? subcategory.toLowerCase() : "similar products"} in this aisle
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export { tierAccentForVerdict };

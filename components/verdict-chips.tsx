"use client";

import { cn } from "@/lib/utils";
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
import { formatDeepseekChip } from "@/lib/ocr/deepseek-promote";

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

export function VerdictBlock({
  verdict,
  score,
  sublabelIds,
  cohortSize,
  relativeScore,
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
  const showCohort = cohortSize != null && cohortSize >= 8 && relativeScore != null;
  const topReasons = [
    ...sublabelChipLabels(sublabelIds),
    ...(deepseekChips ?? []).map(formatDeepseekChip),
  ].slice(0, 3);
  const actionLabel: Record<VerdictId, string> = {
    daily_staple: "Strong regular buy",
    good_choice: "Recommended",
    occasional_treat: "Occasional only",
    skip: "Not recommended",
  };

  return (
    <div
      className={cn("rounded-xl border p-4", className)}
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <div className="flex items-start gap-4">
        {score != null ? (
          <div
            className="flex h-16 min-w-16 items-center justify-center rounded-xl border bg-(--color-panel)/70 px-3 font-display text-4xl font-semibold tabular-nums leading-none"
            style={{ color: c.fg, borderColor: c.border }}
          >
            {score}
          </div>
        ) : null}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: c.fg }}>
            Overall health score
          </p>
          <p className="mt-1 text-xl font-black uppercase tracking-tight text-(--color-fg)">
            {actionLabel[verdict]}
          </p>
          <p className="mt-0.5 text-[12px] font-semibold tracking-tight" style={{ color: c.fg }}>
            {verdictTitle(verdict)}
          </p>
          {showCohort ? (
            <p className="mt-0.5 text-[11px] leading-snug text-(--color-fg-muted)">
              Better than {relativeScore}% in this category
            </p>
          ) : null}
        </div>
      </div>

      {topReasons.length > 0 ? (
        <div className="mt-4 border-t border-current/10 pt-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: c.fg }}>
            Top reasons
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-(--color-fg-muted)">
            {topReasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.fg }} aria-hidden />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showCohort ? (
        <p className="mt-3 text-[11px] leading-snug text-(--color-fg-muted)">
          Ranked against {cohortSize} similar products in this aisle.
        </p>
      ) : null}
    </div>
  );
}

export { tierAccentForVerdict };

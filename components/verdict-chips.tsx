"use client";

import { cn } from "@/lib/utils";
import { BestInCohortChip } from "@/components/best-in-cohort-tooltip";
import {
  SUBLABEL_DESCRIPTIONS,
  SUBLABEL_DISPLAY,
  type SublabelId,
} from "@/lib/scoring/sublabels";
import {
  VERDICT_COLORS,
  sublabelChipLabels,
  tierAccentForVerdict,
  verdictTitle,
} from "@/lib/scoring/verdict-display";
import type { VerdictId } from "@/lib/scoring/verdict";

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
  const chipBorder = c?.chipBorder ?? "#64748b";
  const chipFg = c?.chipFg ?? "#94a3b8";

  // Map label back to sublabel id for tooltip lookup
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
        <span
          className="shrink-0 rounded-full border border-white/20 px-1.5 py-0.5 text-[10px] font-medium text-(--color-fg-dim)"
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

export function VerdictBlock({
  verdict,
  sublabelIds,
  cohortSize,
  relativeScore,
  cohortId,
  subcategory,
  productId,
  className,
}: {
  verdict: VerdictId;
  sublabelIds?: string[] | null;
  cohortSize?: number | null;
  relativeScore?: number | null;
  cohortId?: string | null;
  subcategory?: string | null;
  productId?: string;
  className?: string;
}) {
  const c = VERDICT_COLORS[verdict];

  return (
    <div
      className={cn("rounded-xl border p-4 space-y-3", className)}
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      {/* header row */}
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-base font-bold tracking-tight"
          style={{ color: c.fg }}
        >
          {verdictTitle(verdict)}
        </span>
        {cohortSize != null && cohortSize >= 8 && relativeScore != null ? (
          cohortId && productId ? (
            <BestInCohortChip
              cohortId={cohortId}
              subcategoryLabel={subcategory ?? ""}
              productId={productId}
              borderColor={c.chipBorder}
              fgColor={c.chipFg}
              labelOverride={`Better than ${relativeScore}%`}
            />
          ) : (
            <span
              className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums"
              style={{ borderColor: c.chipBorder, color: c.chipFg }}
            >
              Better than {relativeScore}%
            </span>
          )
        ) : null}
      </div>

      {/* chips with tooltip explanations */}
      {sublabelIds && sublabelIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {sublabelIds.map((id) => {
            const label = SUBLABEL_DISPLAY[id as SublabelId] ?? id;
            const explanation = SUBLABEL_DESCRIPTIONS[id as SublabelId];

            // "Best in category" → hoverable cohort top-N
            if (id === "best_in_category" && cohortId && productId) {
              return (
                <BestInCohortChip
                  key={id}
                  cohortId={cohortId}
                  subcategoryLabel={subcategory ?? ""}
                  productId={productId}
                  borderColor={c.chipBorder}
                  fgColor={c.chipFg}
                />
              );
            }

            return (
              <span
                key={id}
                className="rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-tight"
                style={{ borderColor: c.chipBorder, color: c.chipFg }}
                title={explanation ?? label}
              >
                {label}
              </span>
            );
          })}
        </div>
      ) : null}

      {cohortSize != null && cohortSize >= 8 && relativeScore != null && sublabelIds && sublabelIds.length > 0 ? (
        <p className="text-[11px]" style={{ color: c.fg, opacity: 0.7 }}>
          Better than {relativeScore}% of similar products ({cohortSize} in category)
        </p>
      ) : null}
    </div>
  );
}

// Re-export accent helper used elsewhere
export { tierAccentForVerdict };

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

function SublabelChip({
  id,
  borderColor,
  fgColor,
  cohortId,
  productId,
  subcategory,
}: {
  id: SublabelId;
  borderColor: string;
  fgColor: string;
  cohortId?: string | null;
  productId?: string;
  subcategory?: string | null;
}) {
  const label = SUBLABEL_DISPLAY[id] ?? id;
  const explanation = SUBLABEL_DESCRIPTIONS[id];

  if (id === "best_in_category" && cohortId && productId) {
    return (
      <BestInCohortChip
        cohortId={cohortId}
        subcategoryLabel={subcategory ?? ""}
        productId={productId}
        borderColor={borderColor}
        fgColor={fgColor}
      />
    );
  }

  return (
    <span
      className="cursor-help rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-tight"
      style={{
        borderColor,
        color: fgColor,
        backgroundColor: `color-mix(in srgb, ${borderColor} 10%, var(--color-panel))`,
      }}
      title={explanation ?? label}
    >
      {label}
    </span>
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
  const showCohort =
    cohortSize != null && cohortSize >= 8 && relativeScore != null && cohortId && productId;

  return (
    <div
      className={cn("space-y-3 rounded-xl border p-4", className)}
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <p className="text-base font-bold tracking-tight" style={{ color: c.fg }}>
        {verdictTitle(verdict)}
      </p>

      {(sublabelIds?.length ?? 0) > 0 || showCohort ? (
        <div className="flex flex-wrap gap-1.5">
          {sublabelIds?.map((id) => (
            <SublabelChip
              key={id}
              id={id as SublabelId}
              borderColor={c.chipBorder}
              fgColor={c.chipFg}
              cohortId={cohortId}
              productId={productId}
              subcategory={subcategory}
            />
          ))}
          {showCohort ? (
            <BestInCohortChip
              cohortId={cohortId}
              subcategoryLabel={subcategory ?? ""}
              productId={productId}
              borderColor={c.chipBorder}
              fgColor={c.chipFg}
              labelOverride={`Better than ${relativeScore}%`}
            />
          ) : null}
        </div>
      ) : null}

      {showCohort ? (
        <p className="text-[11px] leading-snug" style={{ color: c.fg, opacity: 0.72 }}>
          Ranked against {cohortSize} similar products in this aisle — hover tags for detail.
        </p>
      ) : null}
    </div>
  );
}

export { tierAccentForVerdict };

/** Merge persisted sublabels with scoring candidates for richer PDP chips. */
export function mergePdpSublabelIds(
  verdictSublabels: string[] | null | undefined,
  breakdown: unknown,
  max = 8,
): string[] {
  const stored = verdictSublabels ?? [];
  const candidates =
    breakdown && typeof breakdown === "object" && "sublabel_candidates" in breakdown
      ? ((breakdown as { sublabel_candidates?: string[] }).sublabel_candidates ?? [])
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...stored, ...candidates]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

import { VERDICT_LABELS, type VerdictId } from "@/lib/scoring/verdict";
import { SUBLABEL_DISPLAY, type SublabelId } from "@/lib/scoring/sublabels";
import { bandFromScore, labelForBand } from "@/lib/utils";

/**
 * Verdict colors — use `color-mix` so they adapt to both light cream and dark
 * themes. The accent stays consistent; the background is a faint tint of the
 * accent over the current panel color.
 */
export const VERDICT_COLORS: Record<
  VerdictId,
  { bg: string; fg: string; border: string; chipBg: string; chipBorder: string; chipFg: string }
> = {
  daily_staple: {
    bg: "color-mix(in srgb, #0f9e75 10%, var(--color-panel))",
    fg: "#0f9e75",
    border: "color-mix(in srgb, #0f9e75 28%, transparent)",
    chipBg: "transparent",
    chipBorder: "#0f9e75",
    chipFg: "#0f9e75",
  },
  good_choice: {
    bg: "color-mix(in srgb, #7ab830 10%, var(--color-panel))",
    fg: "#5d8d22",
    border: "color-mix(in srgb, #7ab830 28%, transparent)",
    chipBg: "transparent",
    chipBorder: "#7ab830",
    chipFg: "#5d8d22",
  },
  occasional_treat: {
    bg: "color-mix(in srgb, #e07030 10%, var(--color-panel))",
    fg: "#c25e1f",
    border: "color-mix(in srgb, #e07030 28%, transparent)",
    chipBg: "transparent",
    chipBorder: "#e07030",
    chipFg: "#c25e1f",
  },
  skip: {
    bg: "color-mix(in srgb, #d43030 10%, var(--color-panel))",
    fg: "#a02525",
    border: "color-mix(in srgb, #d43030 28%, transparent)",
    chipBg: "transparent",
    chipBorder: "#d43030",
    chipFg: "#a02525",
  },
};

export function verdictTitle(id: VerdictId): string {
  return VERDICT_LABELS[id].title;
}

export function sublabelChipLabels(ids: string[] | null | undefined): string[] {
  if (!ids?.length) return [];
  return ids.map((id) => SUBLABEL_DISPLAY[id as SublabelId] ?? id);
}

const VERDICT_TIER: Record<VerdictId, { accent: string; background: string }> = {
  daily_staple: { accent: "#0f9e75", background: "#0d2822" },
  good_choice: { accent: "#7ab830", background: "#141e08" },
  occasional_treat: { accent: "#e07030", background: "#2b1600" },
  skip: { accent: "#d43030", background: "#220808" },
};

const BAND_TIER: Record<string, { accent: string; background: string }> = {
  excellent: { accent: "#0f9e75", background: "#0a3d32" },
  good: { accent: "#22c55e", background: "#14331f" },
  poor: { accent: "#f59e0b", background: "#3d2a0a" },
  bad: { accent: "#ef4444", background: "#3d1212" },
};

/** Catalog score badge — full tier fill color (score only on card). */
export function catalogTierStyle(
  score: number,
  verdict: VerdictId | null | undefined,
): { fill: string } {
  if (verdict) return { fill: VERDICT_TIER[verdict].accent };
  const band = bandFromScore(score);
  return { fill: BAND_TIER[band]?.accent ?? "#64748b" };
}

/** @deprecated Use catalogTierStyle for cards; kept for title tooltips elsewhere. */
export function catalogScorePresentation(
  score: number,
  verdict: VerdictId | null | undefined,
): { accent: string; label: string } {
  const tier = catalogTierStyle(score, verdict);
  const label = verdict
    ? verdictTitle(verdict)
    : labelForBand(bandFromScore(score));
  return { accent: tier.fill, label };
}

export function tierAccentForVerdict(verdict: VerdictId | null | undefined): string {
  if (!verdict) return "#94a3b8";
  return VERDICT_TIER[verdict].accent;
}

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
    bg: "color-mix(in srgb, var(--score-excellent) 10%, var(--color-panel))",
    fg: "var(--score-excellent)",
    border: "color-mix(in srgb, var(--score-excellent) 28%, transparent)",
    chipBg: "transparent",
    chipBorder: "var(--score-excellent)",
    chipFg: "var(--score-excellent)",
  },
  good_choice: {
    bg: "color-mix(in srgb, var(--score-good) 10%, var(--color-panel))",
    fg: "var(--score-good)",
    border: "color-mix(in srgb, var(--score-good) 28%, transparent)",
    chipBg: "transparent",
    chipBorder: "var(--score-good)",
    chipFg: "var(--score-good)",
  },
  occasional_treat: {
    bg: "color-mix(in srgb, var(--score-poor) 10%, var(--color-panel))",
    fg: "var(--score-poor)",
    border: "color-mix(in srgb, var(--score-poor) 28%, transparent)",
    chipBg: "transparent",
    chipBorder: "var(--score-poor)",
    chipFg: "var(--score-poor)",
  },
  skip: {
    bg: "color-mix(in srgb, var(--score-bad) 10%, var(--color-panel))",
    fg: "var(--score-bad)",
    border: "color-mix(in srgb, var(--score-bad) 28%, transparent)",
    chipBg: "transparent",
    chipBorder: "var(--score-bad)",
    chipFg: "var(--score-bad)",
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
  daily_staple: { accent: "var(--score-excellent)", background: "#0d2822" },
  good_choice: { accent: "var(--score-good)", background: "#141e08" },
  occasional_treat: { accent: "var(--score-poor)", background: "#2b1600" },
  skip: { accent: "var(--score-bad)", background: "#220808" },
};

const BAND_TIER: Record<string, { accent: string; background: string }> = {
  excellent: { accent: "var(--score-excellent)", background: "#0a3d32" },
  good: { accent: "var(--score-good)", background: "#14331f" },
  poor: { accent: "var(--score-poor)", background: "#3d2a0a" },
  bad: { accent: "var(--score-bad)", background: "#3d1212" },
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

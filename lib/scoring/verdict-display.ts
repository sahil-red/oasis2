import { VERDICT_LABELS, type VerdictId } from "@/lib/scoring/verdict";
import { SUBLABEL_DISPLAY, type SublabelId } from "@/lib/scoring/sublabels";
import { bandFromScore, labelForBand } from "@/lib/utils";

export const VERDICT_COLORS: Record<
  VerdictId,
  { bg: string; fg: string; border: string; chipBg: string; chipBorder: string; chipFg: string }
> = {
  daily_staple: {
    bg: "#0d2822",
    fg: "#0f9e75",
    border: "rgba(15,158,117,0.3)",
    chipBg: "transparent",
    chipBorder: "#0f9e75",
    chipFg: "#0f9e75",
  },
  good_choice: {
    bg: "#141e08",
    fg: "#7ab830",
    border: "rgba(122,184,48,0.3)",
    chipBg: "transparent",
    chipBorder: "#7ab830",
    chipFg: "#7ab830",
  },
  occasional_treat: {
    bg: "#2b1600",
    fg: "#e07030",
    border: "rgba(224,112,48,0.3)",
    chipBg: "transparent",
    chipBorder: "#e07030",
    chipFg: "#e07030",
  },
  skip: {
    bg: "#220808",
    fg: "#d43030",
    border: "rgba(212,48,48,0.3)",
    chipBg: "transparent",
    chipBorder: "#d43030",
    chipFg: "#d43030",
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

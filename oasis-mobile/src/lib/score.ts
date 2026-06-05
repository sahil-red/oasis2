import { colors } from "@/theme";
import type { VerdictId } from "@/types/api";

export type ScoreBand = "bad" | "poor" | "good" | "excellent";

export function bandFromScore(score: number): ScoreBand {
  if (score >= 76) return "excellent";
  if (score >= 51) return "good";
  if (score >= 26) return "poor";
  return "bad";
}

const BAND_FILL: Record<ScoreBand, string> = {
  excellent: colors.scoreExcellent,
  good: colors.scoreGood,
  poor: colors.scorePoor,
  bad: colors.scoreBad,
};

const VERDICT_FILL: Record<VerdictId, string> = {
  daily_staple: colors.scoreExcellent,
  good_choice: colors.scoreGood,
  occasional_treat: colors.scorePoor,
  skip: colors.scoreBad,
};

export function colorForScore(score: number): string {
  return BAND_FILL[bandFromScore(score)];
}

export function catalogTierFill(score: number, verdict?: VerdictId | null): string {
  if (verdict) return VERDICT_FILL[verdict];
  return BAND_FILL[bandFromScore(score)];
}

export function labelForBand(band: ScoreBand): string {
  const labels: Record<ScoreBand, string> = {
    excellent: "Excellent",
    good: "Good",
    poor: "Poor",
    bad: "Bad",
  };
  return labels[band];
}

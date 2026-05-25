import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ────────────────────────────────────────────────────────────
// Score banding
//   We surface BOTH a Yuka-style 4-tier band (Bad/Poor/Good/Excellent)
//   for the dominant color, and an A–F letter grade for the small
//   chip-style label, since both communicate different things.
// ────────────────────────────────────────────────────────────

export type Grade = "A" | "B" | "C" | "D" | "F";
export type ScoreBand = "bad" | "poor" | "good" | "excellent";

export function gradeFromScore(score: number): Grade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function bandFromScore(score: number): ScoreBand {
  if (score >= 76) return "excellent";
  if (score >= 51) return "good";
  if (score >= 26) return "poor";
  return "bad";
}

const BAND_COLORS: Record<ScoreBand, string> = {
  excellent: "#22c55e",
  good: "#84cc16",
  poor: "#f59e0b",
  bad: "#ef4444",
};

const BAND_LABELS: Record<ScoreBand, string> = {
  excellent: "Excellent",
  good: "Good",
  poor: "Poor",
  bad: "Bad",
};

export function colorForScore(score: number): string {
  return BAND_COLORS[bandFromScore(score)];
}

export function colorForGrade(grade: Grade): string {
  switch (grade) {
    case "A":
      return BAND_COLORS.excellent;
    case "B":
      return BAND_COLORS.good;
    case "C":
      return BAND_COLORS.poor;
    case "D":
      return "#fb923c";
    case "F":
      return BAND_COLORS.bad;
  }
}

export function labelForBand(band: ScoreBand): string {
  return BAND_LABELS[band];
}

// ────────────────────────────────────────────────────────────
// Additive tier (Yuka-inspired)
// ────────────────────────────────────────────────────────────

export type AdditiveTier = "risk-free" | "limited" | "moderate" | "hazardous";

/** Numeric penalty deducted from the 30-point Additives subscore per occurrence. */
export const ADDITIVE_TIER_PENALTY: Record<AdditiveTier, number> = {
  "risk-free": 0,
  limited: 2,
  moderate: 6,
  hazardous: 30, // fully zeros out the Additives axis
};

/**
 * Yuka rule: a single hazardous additive caps the total score at 49,
 * preventing the product from ever reaching the "Good" band regardless
 * of nutrition.
 */
export const HAZARDOUS_HARD_CAP = 49;

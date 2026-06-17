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
  excellent: "var(--score-excellent)",
  good: "var(--score-good)",
  poor: "var(--score-poor)",
  bad: "var(--score-bad)",
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
      return BAND_COLORS.poor;
    case "F":
      return BAND_COLORS.bad;
  }
}

export function labelForBand(band: ScoreBand): string {
  return BAND_LABELS[band];
}

// ────────────────────────────────────────────────────────────
// Unified health tier (Part B) — ONE label system, replacing the
// grade (A–F) + band (4) + verdict (4) trio. Derived from the ABSOLUTE
// health score (consistent + category-baselined), NOT the v9 blend, so
// same-nutrition products always read the same tier. Cutoffs are set from
// the absolute distribution (p25≈26, p50≈41, p75≈58, p90≈68).
// ────────────────────────────────────────────────────────────

export type ScoreTier = "excellent" | "good" | "fair" | "poor";

export function tierFromScore(absolute: number): ScoreTier {
  if (absolute >= 65) return "excellent";
  if (absolute >= 50) return "good";
  if (absolute >= 32) return "fair";
  return "poor";
}

const TIER_META: Record<ScoreTier, { label: string; color: string }> = {
  excellent: { label: "Excellent", color: "var(--score-excellent)" },
  good: { label: "Good", color: "var(--score-good)" },
  fair: { label: "Fair", color: "var(--score-poor)" },
  poor: { label: "Poor", color: "var(--score-bad)" },
};

export function tierLabel(tier: ScoreTier): string {
  return TIER_META[tier].label;
}

export function tierColor(tier: ScoreTier): string {
  return TIER_META[tier].color;
}

/** "Best of 22 soya chunks" / "Top 9% of 22 soya chunks" / "#15 of 22 soya chunks" —
 *  the category-relative rank shown alongside the tier. Returns null when the cohort
 *  is too small to be meaningful. */
export function rankPhrase(rank: number | null, size: number | null, label?: string | null): string | null {
  if (!rank || !size || size < 6) return null;
  const cat = label ? label.toLowerCase() : "category";
  if (rank === 1) return `Best of ${size} ${cat}`;
  const pct = Math.round((rank / size) * 100);
  if (pct <= 33) return `Top ${Math.max(1, pct)}% of ${size} ${cat}`;
  return `#${rank} of ${size} ${cat}`;
}

// ────────────────────────────────────────────────────────────
// Additive tier (Yuka-inspired)
// ────────────────────────────────────────────────────────────

export type AdditiveTier = "risk-free" | "limited" | "moderate" | "hazardous";

/** Numeric penalty deducted from the 30-point Additives subscore per occurrence. */
export const ADDITIVE_TIER_PENALTY: Record<AdditiveTier, number> = {
  "risk-free": 0,
  limited: 3,
  moderate: 5,
  hazardous: 30, // fully zeros out the Additives axis
};

/**
 * Yuka rule: a single hazardous additive caps the total score at 49,
 * preventing the product from ever reaching the "Good" band regardless
 * of nutrition.
 */
export const HAZARDOUS_HARD_CAP = 49;

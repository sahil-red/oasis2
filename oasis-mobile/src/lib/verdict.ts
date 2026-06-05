import { colors } from "@/theme";
import type { VerdictId } from "@/types/api";

export const VERDICT_SHORT: Record<VerdictId, string> = {
  daily_staple: "Staple",
  good_choice: "Good",
  occasional_treat: "Treat",
  skip: "Skip",
};

export const VERDICT_COLORS: Record<
  VerdictId,
  { bg: string; fg: string; border: string }
> = {
  daily_staple: {
    bg: "rgba(36, 166, 111, 0.15)",
    fg: colors.scoreExcellent,
    border: "rgba(36, 166, 111, 0.35)",
  },
  good_choice: {
    bg: "rgba(138, 159, 57, 0.15)",
    fg: colors.scoreGood,
    border: "rgba(138, 159, 57, 0.35)",
  },
  occasional_treat: {
    bg: "rgba(201, 132, 47, 0.15)",
    fg: colors.scorePoor,
    border: "rgba(201, 132, 47, 0.35)",
  },
  skip: {
    bg: "rgba(200, 95, 95, 0.15)",
    fg: colors.scoreBad,
    border: "rgba(200, 95, 95, 0.35)",
  },
};

export function resolveVerdict(
  product: {
    name: string;
    category?: string | null;
    subcategory?: string | null;
    core_scores?: { verdict?: string | null; score?: number } | null;
  },
): VerdictId | null {
  const v = product.core_scores?.verdict;
  const valid: VerdictId[] = ["daily_staple", "good_choice", "occasional_treat", "skip"];
  if (v && valid.includes(v as VerdictId)) return v as VerdictId;
  const score = product.core_scores?.score;
  if (score == null) return null;
  if (score < 40) return "skip";
  if (score < 65) return "occasional_treat";
  if (score >= 80) return "daily_staple";
  return "good_choice";
}

export function formatPrice(p: { price_inr?: number | null; mrp_inr?: number | null }): string {
  const price = p.price_inr ?? p.mrp_inr;
  if (price == null) return "—";
  return `₹${Math.round(price)}`;
}

import type { Grade } from "@/lib/supabase/types";
import { colorForScore } from "@/lib/utils";

/** Theme-aware tinted background for goal/score tiles. */
export function scoreTileSurface(fit: number): {
  backgroundColor: string;
  borderColor: string;
  accentColor: string;
} {
  const c = colorForScore(fit);
  return {
    accentColor: c,
    backgroundColor: `color-mix(in srgb, ${c} 14%, var(--color-panel))`,
    borderColor: `color-mix(in srgb, ${c} 32%, var(--color-line))`,
  };
}

/** Vivid A–F tile surfaces for “All goals at a glance”. */
export function gradeLetterTileSurface(grade: Grade): {
  backgroundColor: string;
  borderColor: string;
  letterColor: string;
} {
  switch (grade) {
    case "A":
      return {
        backgroundColor: "color-mix(in srgb, var(--score-excellent) 42%, var(--color-panel))",
        borderColor: "var(--score-excellent)",
        letterColor: "var(--score-excellent)",
      };
    case "B":
      return {
        backgroundColor: "color-mix(in srgb, var(--score-good) 38%, var(--color-panel))",
        borderColor: "var(--score-good)",
        letterColor: "var(--score-good)",
      };
    case "C":
    case "D":
      return {
        backgroundColor: "color-mix(in srgb, var(--score-poor) 40%, var(--color-panel))",
        borderColor: "var(--score-poor)",
        letterColor: "var(--score-poor)",
      };
    case "F":
      return {
        backgroundColor: "color-mix(in srgb, var(--score-bad) 42%, var(--color-panel))",
        borderColor: "var(--score-bad)",
        letterColor: "var(--score-bad)",
      };
    default:
      return {
        backgroundColor: "var(--color-bg-soft)",
        borderColor: "var(--color-line)",
        letterColor: "var(--color-fg)",
      };
  }
}

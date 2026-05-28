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
        backgroundColor: "color-mix(in srgb, #0f9e75 42%, #0c1f1a)",
        borderColor: "#0f9e75",
        letterColor: "#5eead4",
      };
    case "B":
      return {
        backgroundColor: "color-mix(in srgb, #22c55e 38%, #0f1f14)",
        borderColor: "#22c55e",
        letterColor: "#86efac",
      };
    case "C":
    case "D":
      return {
        backgroundColor: "color-mix(in srgb, #f59e0b 40%, #1f1608)",
        borderColor: "#f59e0b",
        letterColor: "#fcd34d",
      };
    case "F":
      return {
        backgroundColor: "color-mix(in srgb, #ef4444 42%, #1f0c0c)",
        borderColor: "#ef4444",
        letterColor: "#fca5a5",
      };
    default:
      return {
        backgroundColor: "var(--color-bg-soft)",
        borderColor: "var(--color-line)",
        letterColor: "var(--color-fg)",
      };
  }
}

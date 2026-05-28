import { sublabelChipLabels, verdictTitle } from "@/lib/scoring/verdict-display";
import type { VerdictId } from "@/lib/scoring/verdict";
import type { SubScores } from "@/lib/supabase/types";

const CAVEAT_RE =
  /\b(low protein|high sugar|flagged|unreliable|below typical|pulled the score|capped|doesn't match|worth noting|moderate sugar|high sodium|calorie-dense|not enough reliable|additives pulled|marketing)\b/i;

function bestSubscoreLine(subscores?: SubScores): string | null {
  if (!subscores) return null;
  const pillars = [
    { label: "Strong nutrition profile", pct: (subscores.nutrition / 60) * 100 },
    { label: "Clean ingredient list", pct: (subscores.additives / 30) * 100 },
    { label: "Positive pack signals", pct: (subscores.labels / 10) * 100 },
  ];
  const best = pillars.sort((a, b) => b.pct - a.pct)[0];
  return best.pct >= 55 ? best.label : null;
}

/** PDP score card right column — positive headline + one caveat. */
export function pdpScoreHeroCopy(opts: {
  reasons: string[];
  sublabelIds?: string[] | null;
  verdict?: VerdictId | null;
  subscores?: SubScores;
}): { positive: string | null; caveat: string | null } {
  const chips = sublabelChipLabels(opts.sublabelIds);
  const positiveFromChips =
    chips.length > 0 ? chips.slice(0, 3).join(" · ") : null;
  const positive =
    positiveFromChips ??
    bestSubscoreLine(opts.subscores) ??
    (opts.verdict ? verdictTitle(opts.verdict) : null);

  const caveats = opts.reasons.filter((r) => CAVEAT_RE.test(r));
  const caveat = caveats[0] ?? null;

  return { positive, caveat };
}

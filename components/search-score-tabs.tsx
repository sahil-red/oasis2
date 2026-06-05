import { cn } from "@/lib/utils";
import { catalogTierStyle } from "@/lib/scoring/verdict-display";
import type { VerdictId } from "@/lib/scoring/verdict";

/**
 * AI search score badge — shows only the Scout health score in verdict color.
 * The old "MATCH" badge is gone: match=100 on every result is noise, not signal.
 */
export function SearchScoreStack({
  matchScore: _matchScore,
  healthScore,
  verdict,
  className,
}: {
  matchScore: number;
  healthScore?: number | null;
  verdict?: VerdictId | null;
  className?: string;
}) {
  const health =
    typeof healthScore === "number" && Number.isFinite(healthScore) ? healthScore : null;
  if (health == null) return null;
  const style = catalogTierStyle(health, verdict);

  return (
    <div
      className={cn(className)}
      aria-label={`Scout score ${Math.round(health)}`}
    >
      <div
        className="rounded-[10px] px-2 py-1 shadow-md"
        style={{ backgroundColor: style.fill }}
      >
        <span className="font-display text-[17px] font-bold leading-none tabular-nums text-white">
          {Math.round(health)}
        </span>
      </div>
    </div>
  );
}

/** @deprecated Use SearchScoreStack */
export const SearchScoreTabs = SearchScoreStack;

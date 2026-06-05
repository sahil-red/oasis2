import { cn } from "@/lib/utils";
import { catalogTierStyle } from "@/lib/scoring/verdict-display";
import type { VerdictId } from "@/lib/scoring/verdict";

/** AI search — always show match + health (no tabs). */
export function SearchScoreStack({
  matchScore,
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
  const showHealth = health != null;
  const healthFill = showHealth ? catalogTierStyle(health, verdict).fill : null;

  return (
    <div
      className={cn("flex flex-col items-end gap-1", className)}
      aria-label={`Match ${Math.round(matchScore)}${showHealth ? `, health ${Math.round(health)}` : ""}`}
    >
      <div className="rounded-[10px] border border-(--color-line)/80 bg-(--color-panel)/90 px-2 py-1 shadow-sm backdrop-blur-sm">
        <span className="font-display text-[17px] font-semibold leading-none tabular-nums text-(--color-fg)">
          {Math.round(matchScore)}
        </span>
        <span className="ml-1 text-[9px] font-medium uppercase tracking-wide text-(--color-fg-dim)">
          match
        </span>
      </div>
      {showHealth && healthFill ? (
        <div
          className="rounded-[10px] px-2 py-1 shadow-md"
          style={{ backgroundColor: healthFill }}
        >
          <span className="font-display text-[17px] font-bold leading-none tabular-nums text-white">
            {Math.round(health)}
          </span>
          <span className="ml-1 text-[9px] font-semibold uppercase tracking-wide text-white/85">
            health
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use SearchScoreStack */
export const SearchScoreTabs = SearchScoreStack;

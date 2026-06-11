import type { ScoreExplanation } from "@/lib/products/score-explain";
import type { VerdictId } from "@/lib/scoring/verdict";
import { ScoreRing } from "@/components/verdict-chips";
import { buildAutoSentence } from "@/lib/scoring/auto-sentence";
import { BestInCohortChip } from "@/components/best-in-cohort-tooltip";
import { VERDICT_COLORS } from "@/lib/scoring/verdict-display";
import { takeLines, bucketTake, actionableWatchLine } from "@/components/product-take-panel";

const VERDICT_SHORT: Record<VerdictId, string> = {
  daily_staple: "Staple",
  good_choice: "Good",
  occasional_treat: "Treat",
  skip: "Skip",
};

export function VerdictTakeCard({
  verdict,
  score,
  sublabelIds,
  deepseekChips,
  deepseekWhy,
  explanation,
  relativeScore,
  cohortSize,
  cohortId,
  subcategory,
  productId,
  className,
}: {
  verdict: VerdictId;
  score?: number | null;
  sublabelIds?: string[] | null;
  deepseekChips?: string[] | null;
  deepseekWhy?: string | null;
  explanation?: ScoreExplanation | null;
  relativeScore?: number | null;
  cohortSize?: number | null;
  cohortId?: string | null;
  subcategory?: string | null;
  productId?: string;
  className?: string;
}) {
  const c = VERDICT_COLORS[verdict];
  const showCohort =
    cohortSize != null && cohortSize >= 8 && relativeScore != null && cohortId && productId;

  const autoSentence = buildAutoSentence(verdict, sublabelIds, deepseekChips);
  const lines = takeLines(explanation, deepseekWhy);
  const { good, watch } = bucketTake(lines);
  const items = [
    ...good.map((line) => ({ line, tone: "good" as const })),
    ...watch.map((line) => ({ line: actionableWatchLine(line), tone: "watch" as const })),
  ].slice(0, 4);

  // Nothing to show if no sentence and no take items
  if (!autoSentence && !items.length) return null;

  return (
    <section
      className={`rounded-2xl border p-4 sm:p-5 ${className ?? ""}`}
      style={{ backgroundColor: c.bg, borderColor: c.border }}
    >
      <div className="flex items-start gap-4">
        {score != null ? <ScoreRing score={score} color={c.fg} /> : null}
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-tight"
              style={{
                backgroundColor: c.bg,
                color: c.fg,
                borderColor: c.border,
              }}
            >
              {VERDICT_SHORT[verdict]}
            </span>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
              Quick take
            </p>
          </div>

          <h3 className="font-display mt-2 text-balance text-2xl leading-snug text-(--color-fg)">
            {autoSentence}
          </h3>

          {items.length > 0 ? (
            <ul className="mt-2.5 space-y-1 text-[14px] leading-relaxed text-(--color-fg-muted)">
              {items.map((item) => {
                const dotColor = c.chipFg;
                return (
                  <li key={`${item.tone}-${item.line}`} className="flex gap-2 rounded-lg px-1 py-0.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dotColor }}
                      aria-hidden
                    />
                    <span>{item.line}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {showCohort ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
              <BestInCohortChip
                cohortId={cohortId}
                subcategoryLabel={subcategory ?? ""}
                productId={productId}
                borderColor={c.chipBorder}
                fgColor={c.chipFg}
                labelOverride={`Better than ${relativeScore}%`}
              />
              <span className="text-[11px] leading-snug text-(--color-fg-muted)">
                of {cohortSize} {subcategory ? subcategory.toLowerCase() : "similar products"} in this aisle
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

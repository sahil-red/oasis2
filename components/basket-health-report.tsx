"use client";

import { ArrowRight, TrendingUp } from "lucide-react";
import { ScoreRing } from "@/components/verdict-chips";
import { colorForScore } from "@/lib/utils";
import type { BasketAnalysis, SwapImpact } from "@/lib/products/basket-analysis";

/** The basket's weekly report card — state of the cart now, and what the
 *  suggested swaps would buy you. This is the payoff screen of the app. */
export function BasketHealthReport({
  analysis,
  impact,
  swapsLoading,
}: {
  analysis: BasketAnalysis;
  impact: SwapImpact | null;
  swapsLoading: boolean;
}) {
  const score = analysis.avgGoalFit ?? analysis.avgCoreScore;
  if (score == null) return null;

  const rounded = Math.round(score);
  const facts: string[] = [];
  if (analysis.flaggedAdditiveSkus > 0) {
    facts.push(
      `${analysis.flaggedAdditiveSkus} item${analysis.flaggedAdditiveSkus === 1 ? "" : "s"} with flagged additives`,
    );
  }
  if (analysis.avgSugarG != null) {
    facts.push(`~${analysis.avgSugarG.toFixed(1)}g sugar / 100g on average`);
  }
  if (analysis.avgFiberG != null) {
    facts.push(`~${analysis.avgFiberG.toFixed(1)}g fibre / 100g`);
  }

  const scoreGain =
    impact?.scoreNow != null && impact.scoreAfter != null
      ? Math.round(impact.scoreAfter) - Math.round(impact.scoreNow)
      : 0;
  const sugarCut =
    impact?.sugarNowG != null && impact.sugarAfterG != null
      ? impact.sugarNowG - impact.sugarAfterG
      : 0;
  const skipsCleared = impact ? impact.skipsNow - impact.skipsAfter : 0;
  const hasUpside = impact != null && (scoreGain > 0 || sugarCut > 0.5 || skipsCleared > 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-(--color-line) bg-(--color-panel)">
      <div className="flex items-start gap-4 p-4 sm:p-5">
        <ScoreRing score={rounded} color={colorForScore(rounded)} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
            Basket report · {analysis.goalLabel}
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-(--color-fg)">
            {analysis.summary[0] ?? "Cart looks balanced for your goal."}
          </p>
          {facts.length > 0 ? (
            <p className="mt-1.5 text-[12px] leading-snug text-(--color-fg-muted)">
              {facts.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>

      {swapsLoading ? (
        <div className="border-t border-(--color-line) bg-(--color-bg-soft)/60 px-4 py-3 sm:px-5">
          <p className="text-[12px] text-(--color-fg-dim)">Checking the aisles for better swaps…</p>
        </div>
      ) : hasUpside ? (
        <div
          className="border-t px-4 py-3 sm:px-5"
          style={{
            borderColor: "color-mix(in srgb, var(--color-good) 25%, var(--color-line))",
            backgroundColor: "color-mix(in srgb, var(--color-good) 7%, var(--color-panel))",
          }}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-(--color-good)">
              <TrendingUp className="h-3.5 w-3.5" />
              Take the top swaps below
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-(--color-fg-muted)">
              {scoreGain > 0 && impact?.scoreNow != null && impact.scoreAfter != null ? (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  score {Math.round(impact.scoreNow)}
                  <ArrowRight className="h-3 w-3" />
                  <strong className="text-(--color-good)">{Math.round(impact.scoreAfter)}</strong>
                </span>
              ) : null}
              {sugarCut > 0.5 ? (
                <span className="tabular-nums">
                  sugar <strong className="text-(--color-good)">−{sugarCut.toFixed(1)}g</strong>/100g
                </span>
              ) : null}
              {skipsCleared > 0 ? (
                <span>
                  <strong className="text-(--color-good)">
                    {skipsCleared} skip{skipsCleared === 1 ? "" : "s"}
                  </strong>{" "}
                  cleared
                </span>
              ) : null}
              {impact && impact.priceDeltaInr !== 0 ? (
                <span className="tabular-nums">
                  {impact.priceDeltaInr > 0 ? `+₹${impact.priceDeltaInr}` : `−₹${Math.abs(impact.priceDeltaInr)}`}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

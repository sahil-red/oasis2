import type { ProductOpinionRow } from "@/lib/supabase/types";
import type { VerdictId } from "@/lib/scoring/verdict";
import { ScoreRing } from "@/components/verdict-chips";
import { BestInCohortChip } from "@/components/best-in-cohort-tooltip";
import { VERDICT_COLORS, verdictTitle } from "@/lib/scoring/verdict-display";

const VERDICT_SHORT: Record<VerdictId, string> = {
  daily_staple: "Staple",
  good_choice: "Good",
  occasional_treat: "Treat",
  skip: "Skip",
};

export function ScoutVerdictCard({
  verdict,
  score,
  opinion,
  relativeScore,
  cohortSize,
  cohortId,
  subcategory,
  productId,
  className,
}: {
  verdict: VerdictId;
  score?: number | null;
  opinion: ProductOpinionRow | null | undefined;
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

  if (!opinion?.headline || !opinion?.why) return null;

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
              className="stamp-in rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-tight"
              style={{
                backgroundColor: c.bg,
                color: c.fg,
                borderColor: c.border,
              }}
            >
              {VERDICT_SHORT[verdict]}
            </span>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
              Scout&apos;s take
            </p>
          </div>

          <h3 className="font-display mt-2 text-balance text-2xl leading-snug text-(--color-fg)">
            {opinion.headline}
          </h3>

          <p className="mt-2.5 text-[14px] leading-relaxed text-(--color-fg-muted)">
            {opinion.why}
          </p>

          {opinion.caveat ? (
            <p className="mt-2.5 text-[12px] italic text-(--color-fg-dim)">
              {opinion.caveat}
            </p>
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

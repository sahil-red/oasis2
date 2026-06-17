import type { ProductOpinionRow } from "@/lib/supabase/types";
import { ScoreRing } from "@/components/verdict-chips";
import { tierFromScore, tierLabel, tierColor, rankPhrase } from "@/lib/utils";

/**
 * PDP score hero — the new paradigm (Part B): one health TIER (from the consistent
 * absolute score) + the category-relative RANK on the clean taxonomy + the editorial
 * "why". Replaces the bare blended number + the noisy v9 relative percentile. The
 * number lives only as a supporting tier-colored ring.
 */
export function ScoutVerdictCard({
  score,
  absoluteScore,
  categoryRank,
  categorySize,
  categoryLabel,
  opinion,
  className,
}: {
  score?: number | null;
  absoluteScore?: number | null;
  categoryRank?: number | null;
  categorySize?: number | null;
  categoryLabel?: string | null;
  opinion: ProductOpinionRow | null | undefined;
  className?: string;
}) {
  const abs = absoluteScore ?? score ?? null;
  if (abs == null || !opinion?.headline || !opinion?.why) return null;

  const tier = tierFromScore(abs);
  const tc = tierColor(tier);
  const rank = rankPhrase(categoryRank ?? null, categorySize ?? null, categoryLabel ?? null);
  const bg = `color-mix(in srgb, ${tc} 9%, var(--color-bg))`;
  const border = `color-mix(in srgb, ${tc} 28%, transparent)`;

  return (
    <section
      className={`rounded-2xl border p-4 sm:p-5 ${className ?? ""}`}
      style={{ backgroundColor: bg, borderColor: border }}
    >
      <div className="flex items-start gap-4">
        <ScoreRing score={abs} color={tc} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="stamp-in rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-tight"
              style={{ backgroundColor: `color-mix(in srgb, ${tc} 16%, transparent)`, color: tc }}
            >
              {tierLabel(tier)}
            </span>
            {rank ? (
              <span className="text-[11px] font-medium tracking-tight text-(--color-fg-muted)">
                {rank}
              </span>
            ) : (
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
                Scout&apos;s take
              </p>
            )}
          </div>

          <h3 className="font-display mt-2 text-balance text-2xl leading-snug text-(--color-fg)">
            {opinion.headline}
          </h3>

          <p className="mt-2.5 text-[14px] leading-relaxed text-(--color-fg-muted)">
            {opinion.why}
          </p>

          {opinion.caveat ? (
            <p className="mt-2.5 text-[12px] italic text-(--color-fg-dim)">{opinion.caveat}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

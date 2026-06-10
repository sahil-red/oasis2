import type { ProductOpinionRow } from "@/lib/supabase/types";

/** v10 editorial verdict — LLM-written prose grounded in V9 data.
 *  Renders nothing when absent; the rule-based ProductTakePanel is the fallback. */
export function ProductOpinionPanel({ opinion }: { opinion: ProductOpinionRow | null | undefined }) {
  if (!opinion?.headline || !opinion.why) return null;

  return (
    <section className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-4 sm:p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
        Scout&apos;s take
      </p>
      <h3 className="font-display mt-2 text-balance text-2xl leading-snug">
        {opinion.headline}
      </h3>
      <p className="mt-2.5 text-[14px] leading-relaxed text-(--color-fg-muted)">{opinion.why}</p>
      {opinion.caveat ? (
        <p className="mt-2.5 text-[12px] italic text-(--color-fg-dim)">{opinion.caveat}</p>
      ) : null}
    </section>
  );
}

import { cn } from "@/lib/utils";
import type { ScoreExplanation } from "@/lib/products/score-explain";

export function ScoreWhyPanel({
  explanation,
  className,
}: {
  explanation: ScoreExplanation;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-(--color-line) bg-white p-5 sm:p-6",
        className,
      )}
    >
      <h2 className="font-display text-lg text-(--color-fg)">Why this score?</h2>
      <ul className="mt-4 space-y-2.5">
        {explanation.reasons.map((r) => (
          <li key={r} className="flex gap-2.5 text-[15px] leading-snug text-(--color-fg)">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-accent)" />
            <span>{r}</span>
          </li>
        ))}
      </ul>
      {explanation.tradeoffs.length > 0 ? (
        <div className="mt-5 rounded-lg bg-(--color-bg-soft) px-4 py-3.5">
          <p className="text-[13px] font-medium text-(--color-fg-muted)">In practice</p>
          <ul className="mt-2 space-y-1.5 text-[14px] leading-relaxed text-(--color-fg-muted)">
            {explanation.tradeoffs.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

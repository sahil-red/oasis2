import { cn } from "@/lib/utils";
import type { ScoreExplanation } from "@/lib/products/score-explain";

export function ScoreWhyPanel({
  explanation,
  className,
}: {
  explanation: ScoreExplanation;
  className?: string;
}) {
  if (!explanation.tradeoffs.length) return null;

  return (
    <section
      className={cn(
        "rounded-xl border border-(--color-line) bg-(--color-panel) p-5 sm:p-6",
        className,
      )}
    >
      <h2 className="font-display text-lg text-(--color-fg)">In practice</h2>
      <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-(--color-fg-muted)">
        {explanation.tradeoffs.map((t) => (
          <li key={t} className="flex gap-2.5">
            <span className="text-(--color-fg-dim)">·</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

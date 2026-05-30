import type { ScoreExplanation } from "@/lib/products/score-explain";
import { cn } from "@/lib/utils";

/** Merge DeepSeek label why + score reasons into a short subjective blurb. */
function compressTake(
  explanation: ScoreExplanation | null | undefined,
  deepseekWhy?: string | null,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const lines = [
    deepseekWhy,
    ...(explanation ? [...explanation.reasons, ...explanation.tradeoffs] : []),
  ];
  for (const line of lines) {
    if (typeof line !== "string") continue;
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= 3) break;
  }
  return out;
}

export function ProductTakePanel({
  explanation,
  deepseekWhy,
  className,
}: {
  explanation?: ScoreExplanation | null;
  deepseekWhy?: string | null;
  className?: string;
}) {
  const lines = compressTake(explanation, deepseekWhy);
  if (!lines.length) return null;

  return (
    <section
      className={cn(
        "rounded-2xl border border-(--color-line) bg-(--color-bg-soft)/60 px-4 py-4 sm:px-5",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-(--color-fg-dim)">
        Our take
      </p>
      <ul className="mt-2.5 space-y-2 text-[14px] leading-relaxed text-(--color-fg-muted)">
        {lines.map((line) => (
          <li key={line} className="flex gap-2.5">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-(--color-accent)" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

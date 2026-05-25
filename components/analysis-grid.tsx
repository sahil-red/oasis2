import { StatCard } from "@/components/stat-card";
import type { AnalysisHighlight } from "@/lib/products/analysis";
import { cn } from "@/lib/utils";

const TONE_DOT: Record<AnalysisHighlight["tone"], string> = {
  bad: "bg-(--color-bad)",
  warn: "bg-(--color-warn)",
  good: "bg-(--color-good)",
  neutral: "bg-(--color-fg-dim)",
};

const TONE_VALUE: Record<AnalysisHighlight["tone"], string> = {
  bad: "text-(--color-bad)",
  warn: "text-(--color-warn)",
  good: "text-(--color-good)",
  neutral: "text-(--color-fg)",
};

export function AnalysisGrid({
  highlights,
  compact,
}: {
  highlights: AnalysisHighlight[];
  compact?: boolean;
}) {
  if (!highlights.length) return null;

  if (compact) {
    const items = highlights.slice(0, 3);
    return (
      <p className="text-[13px] leading-normal text-(--color-fg)">
        {items.map((h, i) => (
          <span key={h.label}>
            {i > 0 ? (
              <span className="mx-1.5 text-(--color-line-strong)" aria-hidden>
                ·
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 align-middle whitespace-nowrap">
              <span
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[h.tone]}`}
              />
              <span className="font-medium">{h.label}</span>{" "}
              <span className={cn("font-semibold tabular-nums", TONE_VALUE[h.tone])}>
                {h.value}
              </span>
            </span>
          </span>
        ))}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {highlights.map((h, i) => (
        <StatCard
          key={h.label}
          label={h.label}
          value={h.value}
          caption={h.caption}
          tone={h.tone}
          delay={i * 60}
          className="!rounded-xl !p-4"
        />
      ))}
    </div>
  );
}

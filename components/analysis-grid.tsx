import { StatCard } from "@/components/stat-card";
import type { AnalysisHighlight } from "@/lib/products/analysis";

const TONE_DOT: Record<AnalysisHighlight["tone"], string> = {
  bad: "bg-(--color-bad)",
  warn: "bg-(--color-warn)",
  good: "bg-(--color-good)",
  neutral: "bg-(--color-fg-dim)",
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
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-relaxed text-(--color-fg-dim)">
        {highlights.slice(0, 3).map((h, i) => (
          <span key={h.label} className="inline-flex items-center gap-1.5">
            {i > 0 ? <span aria-hidden>·</span> : null}
            <span className={`h-1 w-1 shrink-0 rounded-full ${TONE_DOT[h.tone]}`} />
            {h.label} {h.value}
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

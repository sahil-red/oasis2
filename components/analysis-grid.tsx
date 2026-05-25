import { StatCard } from "@/components/stat-card";
import type { AnalysisHighlight } from "@/lib/products/analysis";

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
      <div className="flex flex-wrap gap-1.5">
        {highlights.slice(0, 3).map((h) => (
          <span
            key={h.label}
            className="inline-flex items-center gap-1 rounded-md bg-(--color-bg-soft) px-2 py-1 text-[11px] text-(--color-fg-muted) ring-1 ring-(--color-line)"
          >
            <span
              className={`h-1 w-1 rounded-full ${
                h.tone === "bad"
                  ? "bg-(--color-bad)"
                  : h.tone === "warn"
                    ? "bg-(--color-warn)"
                    : h.tone === "good"
                      ? "bg-(--color-good)"
                      : "bg-(--color-fg-dim)"
              }`}
            />
            {h.label} {h.value}
          </span>
        ))}
      </div>
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

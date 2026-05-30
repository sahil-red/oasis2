import type { ScoreExplanation } from "@/lib/products/score-explain";
import { cn } from "@/lib/utils";

/** Merge DeepSeek label why + score reasons into a short subjective blurb. */
function takeLines(
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

function isPositiveTake(line: string): boolean {
  return /low sugar|no added|zero trans|good protein|decent fibre|decent fiber|clean ingredients|no flagged|works well|fine to keep/i.test(line);
}

function bucketTake(lines: string[]): { good: string[]; watch: string[] } {
  const good: string[] = [];
  const watch: string[] = [];

  for (const line of lines) {
    if (isPositiveTake(line)) good.push(line);
    else watch.push(line);
  }

  return {
    good: good.slice(0, 2),
    watch: watch.slice(0, 3),
  };
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
  const lines = takeLines(explanation, deepseekWhy);
  if (!lines.length) return null;
  const { good, watch } = bucketTake(lines);

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
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {good.length > 0 ? (
          <TakeBucket title="Good" lines={good} tone="good" />
        ) : null}
        <TakeBucket title="Watch" lines={watch.length ? watch : lines.slice(0, 2)} tone="watch" />
      </div>
    </section>
  );
}

function TakeBucket({
  title,
  lines,
  tone,
}: {
  title: string;
  lines: string[];
  tone: "good" | "watch";
}) {
  const color = tone === "good" ? "var(--score-excellent)" : "var(--score-poor)";

  return (
    <div>
      <p className="text-[12px] font-semibold" style={{ color }}>
        {title}
      </p>
      <ul className="mt-1.5 space-y-1.5 text-[13px] leading-snug text-(--color-fg-muted)">
        {lines.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

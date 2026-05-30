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
  const items = [
    ...good.map((line) => ({ line, tone: "good" as const, label: "Good" })),
    ...watch.map((line) => ({ line, tone: "watch" as const, label: "Watch" })),
  ].slice(0, 4);

  return (
    <section
      className={cn(
        "rounded-2xl border border-(--color-line) bg-(--color-bg-soft)/60 px-4 py-3.5 sm:px-5",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-(--color-fg-dim)">
        Quick take
      </p>
      <ul className="mt-2.5 grid gap-1.5 text-[13px] leading-snug text-(--color-fg-muted) sm:grid-cols-2">
        {items.map((item) => (
          <TakeLine key={`${item.label}-${item.line}`} {...item} />
        ))}
      </ul>
    </section>
  );
}

function TakeLine({
  line,
  tone,
  label,
}: {
  line: string;
  tone: "good" | "watch";
  label: string;
}) {
  const color = tone === "good" ? "var(--score-excellent)" : "var(--score-poor)";

  return (
    <li className="flex gap-2 rounded-xl bg-(--color-panel)/60 px-2.5 py-2">
      <span
        className="mt-0.5 shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
        style={{
          color,
          borderColor: `color-mix(in srgb, ${color} 45%, var(--color-line))`,
          backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        }}
      >
        {label}
      </span>
      <span>{line}</span>
    </li>
  );
}

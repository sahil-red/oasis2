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
    ...good.map((line) => ({ line, tone: "good" as const })),
    ...watch.map((line) => ({ line: actionableWatchLine(line), tone: "watch" as const })),
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
      <ul className="mt-2.5 space-y-1.5 text-[13px] leading-snug text-(--color-fg-muted)">
        {items.map((item) => (
          <TakeLine key={`${item.tone}-${item.line}`} {...item} />
        ))}
      </ul>
    </section>
  );
}

function actionableWatchLine(line: string): string {
  if (/occasion|daily|regular|swap|default|portion|look for|check/i.test(line)) return line;
  if (/sodium/i.test(line)) return `${line} — choose a lower-sodium swap for regular snacking.`;
  if (/saturated fat|fat/i.test(line)) return `${line} — fine occasionally, not daily.`;
  if (/sugar/i.test(line)) return `${line} — avoid making it a routine snack.`;
  if (/additive|flavour|flavor|capped/i.test(line)) return `${line} — pick a cleaner ingredient list if possible.`;
  return `${line} — compare the alternatives before buying.`;
}

function TakeLine({
  line,
  tone,
}: {
  line: string;
  tone: "good" | "watch";
}) {
  const color = tone === "good" ? "var(--score-excellent)" : "var(--score-poor)";

  return (
    <li className="flex gap-2 rounded-lg px-1 py-0.5">
      <span
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span>{line}</span>
    </li>
  );
}

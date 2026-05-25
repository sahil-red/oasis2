import { cn } from "@/lib/utils";
import type { Grade } from "@/lib/utils";

const GRADES: { grade: Grade; range: string; meaning: string }[] = [
  { grade: "A", range: "85–100", meaning: "Excellent for everyday use in this category" },
  { grade: "B", range: "70–84", meaning: "Good — a solid buy" },
  { grade: "C", range: "55–69", meaning: "Mixed — fine sometimes, not a staple" },
  { grade: "D", range: "40–54", meaning: "Below average — check swaps" },
  { grade: "F", range: "0–39", meaning: "Poor fit on the label" },
];

const COLORS: Record<Grade, string> = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#f59e0b",
  D: "#fb923c",
  F: "#ef4444",
};

export function GradeLegend({
  compact,
  bare,
  className,
}: {
  compact?: boolean;
  /** No outer card — for nesting inside another panel */
  bare?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        !bare && "rounded-lg border border-(--color-line) bg-white",
        compact ? "px-3 py-2.5" : "px-4 py-3.5",
        className,
      )}
    >
      <p className="text-[12px] font-medium text-(--color-fg-dim)">Grading scale (A–F)</p>
      <ul
        className={cn(
          "mt-2 grid gap-x-4 gap-y-1.5 text-[13px] leading-snug text-(--color-fg-muted)",
          compact ? "grid-cols-1" : "sm:grid-cols-2",
        )}
      >
        {GRADES.map(({ grade, range, meaning }) => (
          <li key={grade} className="flex gap-2">
            <span
              className="w-5 shrink-0 font-semibold tabular-nums"
              style={{ color: COLORS[grade] }}
            >
              {grade}
            </span>
            <span>
              <span className="tabular-nums text-(--color-fg-dim)">{range}</span>
              {" — "}
              {meaning}
            </span>
          </li>
        ))}
      </ul>
      {compact ? null : (
        <p className="mt-2 text-[12px] text-(--color-fg-dim)">
          Color runs green → red on the same scale for overall and goal scores.
        </p>
      )}
    </div>
  );
}

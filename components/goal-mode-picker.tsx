"use client";

import { GOAL_PROFILES, type GoalId } from "@/lib/goals/types";
import { cn } from "@/lib/utils";

export function GoalModePicker({
  value,
  onChange,
  compact,
}: {
  value: GoalId;
  onChange: (g: GoalId) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-2", compact ? "" : "max-w-2xl")}>
      {!compact ? (
        <p className="text-sm text-(--color-fg-muted)">
          Re-rank the catalog for your goal. Swap ideas live on each product page (same aisle,
          better fit).
        </p>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {GOAL_PROFILES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(g.id)}
            title={g.description}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-left text-[12px] transition",
              value === g.id
                ? "bg-(--color-fg) text-(--color-bg)"
                : "bg-(--color-bg-soft) text-(--color-fg-muted) hover:text-(--color-fg)",
            )}
          >
            <span className="font-medium">{g.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

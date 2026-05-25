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
    <div className={cn(compact ? "" : "space-y-1.5")}>
      {!compact ? (
        <p className="text-[13px] leading-snug text-(--color-fg-muted)">
          Rankings update across the catalog.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {GOAL_PROFILES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(g.id)}
            title={g.description}
            className={cn(
              "rounded-full px-2.5 py-1.5 text-[12px] transition",
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

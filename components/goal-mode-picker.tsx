"use client";

import { GOAL_PROFILES, type GoalId } from "@/lib/goals/types";
import { cn } from "@/lib/utils";

export function GoalModePicker({
  value,
  onChange,
  compact,
  vegAllowEggs = false,
  onVegAllowEggsChange,
}: {
  value: GoalId;
  onChange: (g: GoalId) => void;
  compact?: boolean;
  vegAllowEggs?: boolean;
  onVegAllowEggsChange?: (allow: boolean) => void;
}) {
  return (
    <div className={cn(compact ? "" : "space-y-2")}>
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
      {value === "veg" && onVegAllowEggsChange ? (
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-(--color-line) bg-white px-3 py-2.5 text-[13px] text-(--color-fg)">
          <input
            type="checkbox"
            checked={vegAllowEggs}
            onChange={(e) => onVegAllowEggsChange(e.target.checked)}
            className="h-4 w-4 rounded border-(--color-line) accent-(--color-fg)"
          />
          <span>
            <span className="font-medium">Allow eggs</span>
            <span className="block text-[12px] text-(--color-fg-muted)">
              Off = pure veg (no egg). On = lacto-ovo style.
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

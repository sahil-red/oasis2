"use client";

import { DIET_PROFILES, type DietMode } from "@/lib/diet/types";
import { cn } from "@/lib/utils";

export function DietPicker({
  value,
  onChange,
  compact,
}: {
  value: DietMode;
  onChange: (d: DietMode) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn(compact ? "" : "space-y-2")}>
      {!compact ? (
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
          Diet
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {DIET_PROFILES.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onChange(d.id)}
            title={d.description}
            className={cn(
              "rounded-full px-2.5 py-1 text-[12px] transition",
              value === d.id
                ? "bg-(--color-fg) text-(--color-bg)"
                : "bg-(--color-bg-soft) text-(--color-fg-muted) hover:text-(--color-fg)",
            )}
          >
            <span className="font-medium">{d.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

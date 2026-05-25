import { cn, colorForScore } from "@/lib/utils";
import type { SubScores } from "@/lib/supabase/types";

const AXES: { key: keyof SubScores; label: string; max: number }[] = [
  { key: "nutrition", label: "Nutrition", max: 60 },
  { key: "additives", label: "Additives", max: 30 },
  { key: "labels", label: "Labels", max: 10 },
];

export function SubscoreBars({ subscores }: { subscores: SubScores }) {
  const total = subscores.nutrition + subscores.additives + subscores.labels;

  return (
    <div className="space-y-4">
      {AXES.map(({ key, label, max }) => {
        const value = subscores[key];
        const pct = Math.round((value / max) * 100);
        const color = colorForScore(Math.round((value / max) * 100));

        return (
          <div key={key}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-(--color-fg-muted)">{label}</span>
              <span className="tabular-nums text-(--color-fg)">
                {value}
                <span className="text-(--color-fg-dim)"> / {max}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-(--color-panel-2)">
              <div
                className={cn("h-full rounded-full transition-all")}
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-(--color-fg-dim)">
        Subscores sum to {total} before category caps and hazardous additive limits.
      </p>
    </div>
  );
}

"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { writeStoredGoal } from "@/lib/goals/storage";
import type { GoalFitRow } from "@/lib/goals/build-goal-rows";
import type { GoalId } from "@/lib/goals/types";
import { fitVerdictLabel, scorePresentation, type FitVerdict } from "@/lib/goals/verdict";
import { cn, colorForScore, type Grade } from "@/lib/utils";

const VERDICT_STYLE: Record<FitVerdict, string> = {
  strong: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  okay: "bg-amber-50 text-amber-900 ring-amber-200",
  weak: "bg-red-50 text-red-800 ring-red-200",
};

export function ProductGoalFitList({
  rows,
  overall,
}: {
  rows: GoalFitRow[];
  overall: { fit: number; grade: Grade; reasons: string[] } | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = (searchParams.get("goal") ?? "balanced") as GoalId;

  const select = (id: GoalId) => {
    writeStoredGoal(id);
    const p = new URLSearchParams(searchParams.toString());
    if (id === "balanced") p.delete("goal");
    else p.set("goal", id);
    const q = p.toString();
    window.location.href = q ? `${pathname}?${q}` : pathname;
  };

  const sorted = [...rows].sort((a, b) => b.fit - a.fit);

  return (
    <section className="mt-6 rounded-xl border border-(--color-line) bg-(--color-bg-soft) p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-(--color-fg)">How it fits your goals</h2>
        <p className="text-[12px] text-(--color-fg-dim)">Tap to use for swaps</p>
      </div>

      <ul className="mt-4 space-y-2">
        {overall ? (
          <GoalRowButton
            label="Overall"
            fit={overall.fit}
            reasons={overall.reasons}
            active={active === "balanced"}
            onSelect={() => select("balanced")}
            gradeOverride={overall.grade}
          />
        ) : null}
        {sorted.map((row) => (
          <GoalRowButton
            key={row.id}
            label={row.label}
            fit={row.fit}
            reasons={row.reasons}
            active={active === row.id}
            onSelect={() => select(row.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function GoalRowButton({
  label,
  fit,
  reasons,
  active,
  onSelect,
  gradeOverride,
}: {
  label: string;
  fit: number;
  reasons: string[];
  active: boolean;
  onSelect: () => void;
  gradeOverride?: Grade;
}) {
  const pres = scorePresentation(fit);
  const grade = gradeOverride ?? pres.grade;
  const color = colorForScore(fit);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full rounded-lg border bg-white px-3.5 py-3 text-left transition",
          active
            ? "border-(--color-fg) ring-2 ring-(--color-fg)/10"
            : "border-(--color-line) hover:border-(--color-fg-muted)",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-[3.5rem] shrink-0 text-center">
            <span
              className="font-display text-2xl font-semibold leading-none tabular-nums"
              style={{ color }}
            >
              {fit}
            </span>
            <span
              className="mt-1 block text-[13px] font-semibold tabular-nums"
              style={{ color }}
            >
              {grade}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-medium text-(--color-fg)">{label}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                  VERDICT_STYLE[pres.verdict],
                )}
              >
                {fitVerdictLabel(pres.verdict)}
              </span>
            </div>
            <p className="mt-1.5 text-[14px] leading-snug text-(--color-fg-muted)">
              {reasons.length ? reasons.join(" · ") : "See nutrition below for detail."}
            </p>
          </div>
        </div>
      </button>
    </li>
  );
}

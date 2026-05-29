"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { colorForScore } from "@/lib/utils";
import { writeStoredGoal } from "@/lib/goals/storage";
import type { GoalFitRow } from "@/lib/goals/build-goal-rows";
import { GOAL_PROFILES, type GoalId } from "@/lib/goals/types";
import { scorePresentation } from "@/lib/goals/verdict";
import { cn, type Grade } from "@/lib/utils";

export function ProductGoalFitList({
  rows,
  overall,
}: {
  rows: GoalFitRow[];
  overall: { fit: number; grade: Grade; reasons: string[] } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = (searchParams.get("goal") ?? "balanced") as GoalId;

  const select = (id: GoalId) => {
    writeStoredGoal(id);
    const p = new URLSearchParams(searchParams.toString());
    if (id === "balanced") p.delete("goal");
    else p.set("goal", id);
    p.delete("allow_eggs");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const profileLabel = (id: GoalId) =>
    GOAL_PROFILES.find((g) => g.id === id)?.label ?? id;

  const profileShort = (id: GoalId) =>
    GOAL_PROFILES.find((g) => g.id === id)?.short ?? profileLabel(id);

  const gridGoals: {
    id: GoalId;
    label: string;
    fit: number;
    grade: Grade;
    caption: string;
  }[] = [];

  if (overall) {
    gridGoals.push({
      id: "balanced",
      label: "Overall",
      fit: overall.fit,
      grade: overall.grade,
      caption: overall.reasons[0] ?? "Nutrition + ingredients",
    });
  }

  const tileOrder: GoalId[] = [
    "gym",
    "fat-loss",
    "bulk",
    "diabetic",
    "pcos",
    "protein-budget",
    "kids",
  ];
  for (const id of tileOrder) {
    const row = rows.find((r) => r.id === id);
    if (!row) continue;
    gridGoals.push({
      id: row.id,
      label: profileShort(row.id),
      fit: row.fit,
      grade: scorePresentation(row.fit).grade,
      caption: row.primaryMetric,
    });
  }

  const activeGoal = gridGoals.find((g) => g.id === active);

  if (!gridGoals.length) {
    return (
      <p className="mt-6 rounded-xl border border-(--color-line) bg-(--color-bg-soft) px-4 py-3 text-sm text-(--color-fg-muted)">
        Score pending — goal fit will appear once nutrition is available.
      </p>
    );
  }

  return (
    <section className="mt-6">
      <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
              Goal fit
            </p>
            {activeGoal ? (
              <p className="mt-1 text-[13px] leading-snug text-(--color-fg-muted)">
                {activeGoal.caption}
              </p>
            ) : null}
          </div>
          {activeGoal ? (
            <div className="flex items-baseline gap-2">
              <span
                className="font-display text-4xl leading-none tabular-nums"
                style={{ color: colorForScore(activeGoal.fit) }}
              >
                {activeGoal.fit}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-(--color-fg-dim)">
                {activeGoal.grade}
              </span>
            </div>
          ) : null}
        </div>

        <ul className="mt-4 space-y-1">
          {gridGoals.map((g) => (
            <GoalFitRow
              key={g.id}
              label={g.label}
              fit={g.fit}
              grade={g.grade}
              active={active === g.id}
              onSelect={() => select(g.id)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function GoalFitRow({
  label,
  fit,
  grade,
  active,
  onSelect,
}: {
  label: string;
  fit: number;
  grade: Grade;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
          active
            ? "bg-(--color-accent-soft) ring-1 ring-(--color-accent)/25"
            : "hover:bg-(--color-bg-soft)",
        )}
      >
        <span
          className={cn(
            "min-w-[5.5rem] text-[13px] font-medium",
            active ? "text-(--color-fg)" : "text-(--color-fg-muted)",
          )}
        >
          {label}
        </span>
        <span className="flex-1" aria-hidden />
        <span
          className="w-8 text-center text-[10px] font-semibold uppercase tracking-wider text-(--color-fg-dim)"
        >
          {grade}
        </span>
        <span
          className="min-w-[2.25rem] text-right font-display text-xl tabular-nums leading-none"
          style={{ color: colorForScore(fit) }}
        >
          {fit}
        </span>
      </button>
    </li>
  );
}

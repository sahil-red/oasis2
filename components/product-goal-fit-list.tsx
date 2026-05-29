"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { colorForScore } from "@/lib/utils";
import { writeStoredGoal } from "@/lib/goals/storage";
import type { GoalFitRow } from "@/lib/goals/build-goal-rows";
import { GOAL_PROFILES, type GoalId } from "@/lib/goals/types";
import { scorePresentation } from "@/lib/goals/verdict";
import { gradeLetterTileSurface } from "@/lib/score/surfaces";
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

  const activeRow =
    active === "balanced"
      ? overall
        ? {
            variant: "overall" as const,
            fit: overall.fit,
            grade: overall.grade,
            caption: overall.reasons[0] ?? "Nutrition + ingredients",
          }
        : null
      : (() => {
          const row = rows.find((r) => r.id === active);
          if (!row) return null;
          const pres = scorePresentation(row.fit);
          return {
            variant: "goal" as const,
            label: profileLabel(row.id),
            fit: row.fit,
            grade: pres.grade,
            caption: row.primaryMetric,
          };
        })();

  const profileShort = (id: GoalId) =>
    GOAL_PROFILES.find((g) => g.id === id)?.short ?? profileLabel(id);

  const gridGoals: {
    id: GoalId;
    label: string;
    fit: number;
    grade?: Grade;
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
  // Keep tile order stable instead of resorting by fit — humans read tiles
  // left→right and expect the same goals in the same place each visit.
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
      caption: row.primaryMetric,
    });
  }

  return (
    <section className="mt-6">
      {activeRow ? (
        <ActiveGoalHero
          variant={activeRow.variant}
          label={"label" in activeRow ? activeRow.label : undefined}
          caption={activeRow.caption}
          fit={activeRow.fit}
          grade={activeRow.grade}
        />
      ) : (
        <p className="rounded-xl border border-(--color-line) bg-(--color-bg-soft) px-4 py-3 text-sm text-(--color-fg-muted)">
          Score pending — goal fit will appear once nutrition is available.
        </p>
      )}

      {gridGoals.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-(--color-line) bg-(--color-panel) p-3 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
            All goals at a glance
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {gridGoals.map((g) => (
              <GoalFitTile
                key={g.id}
                label={g.label}
                fit={g.fit}
                grade={g.grade}
                caption={g.caption}
                active={active === g.id}
                onSelect={() => select(g.id)}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ActiveGoalHero({
  variant,
  label,
  caption,
  fit,
  grade,
}: {
  variant: "overall" | "goal";
  label?: string;
  caption?: string;
  fit: number;
  grade: Grade;
}) {
  return (
    <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
      <div className="flex items-start gap-5">
        <div className="flex shrink-0 flex-col items-start">
          <span
            className="font-display text-5xl leading-none tabular-nums"
            style={{ color: colorForScore(fit) }}
          >
            {fit}
          </span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
            {grade}
          </span>
        </div>
        <div className="min-w-0 flex-1 pt-1">
          {variant === "goal" && label ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-(--color-fg-dim)">
              {label}
            </p>
          ) : null}
          {caption ? (
            <p
              className={cn(
                "text-[14px] leading-snug text-(--color-fg-muted)",
                variant === "goal" && label ? "mt-1" : "",
              )}
            >
              {caption}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GoalFitTile({
  label,
  fit,
  grade: gradeOverride,
  caption,
  active,
  onSelect,
}: {
  label: string;
  fit: number;
  grade?: Grade;
  caption: string;
  active: boolean;
  onSelect: () => void;
}) {
  const pres = scorePresentation(fit);
  const grade = gradeOverride ?? pres.grade;
  const surface = gradeLetterTileSurface(grade);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "score-tile-surface flex min-h-[120px] w-full flex-col justify-between rounded-xl border py-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-md",
          active && "ring-2 ring-white/30",
        )}
        style={{
          backgroundColor: surface.backgroundColor,
          borderColor: surface.borderColor,
          padding: "14px 12px",
        }}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="pr-2 text-[12px] font-semibold leading-tight text-white/90">
            {label}
          </span>
          <span
            className="shrink-0 font-display text-[34px] font-bold leading-none"
            style={{ color: surface.letterColor }}
          >
            {grade}
          </span>
        </span>
        <span className="mt-2 line-clamp-2 min-h-[2.5rem] text-[11.5px] leading-[1.35] text-white/75">
          {caption}
        </span>
      </button>
    </li>
  );
}

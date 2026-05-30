"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { writeStoredGoal } from "@/lib/goals/storage";
import type { GoalFitRow } from "@/lib/goals/build-goal-rows";
import { GOAL_PROFILES, type GoalId } from "@/lib/goals/types";
import { scorePresentation } from "@/lib/goals/verdict";
import { scoreTileSurface } from "@/lib/score/surfaces";
import { bandFromScore, cn, type Grade } from "@/lib/utils";

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
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-(--color-line) pb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
              Goals at a glance
            </p>
            {activeGoal ? (
              <p className="mt-1.5 text-[13px] leading-snug text-(--color-fg-muted)">
                {activeGoal.caption}
              </p>
            ) : null}
          </div>
          {activeGoal ? (
            <ScorePill fit={activeGoal.fit} grade={activeGoal.grade} size="lg" />
          ) : null}
        </div>

        <ul className="mt-3 space-y-2.5">
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

function ScorePill({
  fit,
  grade,
  size = "sm",
}: {
  fit: number;
  grade: Grade;
  size?: "sm" | "lg";
}) {
  const band = bandFromScore(fit);
  const surface = scoreTileSurface(fit);
  const large = size === "lg";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        data-band={band}
        className={cn(
          "score-band-chip rounded-md font-semibold uppercase tracking-wide",
          large ? "px-2 py-1 text-[11px]" : "px-1.5 py-0.5 text-[10px]",
        )}
      >
        {grade}
      </span>
      <span
        className={cn(
          "flex items-center justify-center rounded-xl border font-display tabular-nums leading-none",
          large ? "h-12 min-w-[3.25rem] text-3xl" : "h-9 min-w-[2.75rem] text-lg",
        )}
        style={{
          backgroundColor: surface.backgroundColor,
          borderColor: surface.borderColor,
          color: surface.accentColor,
        }}
      >
        {fit}
      </span>
    </div>
  );
}

function GoalFitRow({
  label,
  fit,
  grade: _grade,
  active,
  onSelect,
}: {
  label: string;
  fit: number;
  grade: Grade;
  active: boolean;
  onSelect: () => void;
}) {
  const surface = scoreTileSurface(fit);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "group grid w-full grid-cols-[80px_minmax(0,1fr)_34px] items-center gap-3 rounded-xl px-2 py-1.5 text-left transition sm:grid-cols-[96px_minmax(0,1fr)_38px]",
          active
            ? "bg-(--color-bg-soft) ring-1 ring-(--color-line-strong)"
            : "hover:bg-(--color-bg-soft)/70",
        )}
      >
        <span
          className={cn(
            "min-w-0 px-1 text-[13px] font-medium",
            active
              ? "text-(--color-fg)"
              : "text-(--color-fg-muted) group-hover:text-(--color-fg)",
          )}
        >
          {label}
        </span>
        <span className="h-1.5 min-w-0 overflow-hidden rounded-full bg-(--color-bg-soft)">
          <span
            className="block h-full rounded-full transition-[width]"
            style={{
              width: `${Math.max(2, Math.min(100, fit))}%`,
              backgroundColor: surface.accentColor,
            }}
          />
        </span>
        <span
          className={cn(
            "flex h-7 w-9 shrink-0 items-center justify-center rounded-lg border font-display text-[15px] tabular-nums leading-none transition",
          )}
          style={
            active
              ? {
                  backgroundColor: surface.backgroundColor,
                  borderColor: surface.borderColor,
                  color: surface.accentColor,
                }
              : {
                  backgroundColor: "var(--color-panel)",
                  borderColor: "var(--color-line)",
                  color: "var(--color-fg-muted)",
                }
          }
        >
          {fit}
        </span>
      </button>
    </li>
  );
}

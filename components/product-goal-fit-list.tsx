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
  className,
  cardClassName,
}: {
  rows: GoalFitRow[];
  overall: { fit: number; grade: Grade; reasons: string[] } | null;
  className?: string;
  cardClassName?: string;
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
      <p className={cn("mt-6 rounded-xl border border-(--color-line) bg-(--color-bg-soft) px-4 py-3 text-sm text-(--color-fg-muted)", className)}>
        Score pending — goal fit will appear once nutrition is available.
      </p>
    );
  }

  return (
    <section className={cn("mt-6", className)}>
      <div className={cn("rounded-2xl border border-(--color-line) bg-(--color-panel) p-4 sm:p-5", cardClassName)}>
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

        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {gridGoals.map((g) => (
            <GoalFitTile
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

function GoalFitTile({
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
  const surface = scoreTileSurface(fit);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "group flex h-full min-h-[104px] w-full flex-col justify-between rounded-xl border px-3 py-3 text-left transition",
          active
            ? "border-(--color-line-strong) bg-(--color-bg-soft) shadow-sm"
            : "border-(--color-line) bg-(--color-bg-soft)/45 hover:bg-(--color-bg-soft)",
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "min-w-0 text-[13px] font-medium",
              active
                ? "text-(--color-fg)"
                : "text-(--color-fg-muted) group-hover:text-(--color-fg)",
            )}
          >
            {label}
          </span>
          <span
            className="rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              backgroundColor: surface.backgroundColor,
              borderColor: surface.borderColor,
              color: surface.accentColor,
            }}
          >
            {grade}
          </span>
        </span>
        <span
          className="mt-3 flex items-end justify-between gap-3"
        >
          <span
            className="font-display text-4xl tabular-nums leading-none"
            style={{ color: surface.accentColor }}
          >
            {fit}
          </span>
          <span className="mb-1 h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-(--color-panel)">
            <span
              className="block h-full rounded-full transition-[width]"
              style={{
                width: `${Math.max(2, Math.min(100, fit))}%`,
                backgroundColor: surface.accentColor,
              }}
            />
          </span>
        </span>
      </button>
    </li>
  );
}

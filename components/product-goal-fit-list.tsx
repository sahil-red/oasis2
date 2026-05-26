"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ScoreRing } from "@/components/score-ring";
import { writeStoredGoal } from "@/lib/goals/storage";
import type { GoalFitRow } from "@/lib/goals/build-goal-rows";
import { GOAL_PROFILES, type GoalId } from "@/lib/goals/types";
import { scorePresentation } from "@/lib/goals/verdict";
import { cn, colorForScore, type Grade } from "@/lib/utils";

function fitTileSurface(fit: number): { backgroundColor: string; borderColor: string } {
  const c = colorForScore(fit);
  return {
    backgroundColor: `color-mix(in srgb, ${c} 16%, white)`,
    borderColor: `color-mix(in srgb, ${c} 42%, #e8e4df)`,
  };
}

export function ProductGoalFitList({
  rows,
  overall,
  scoreReasons,
}: {
  rows: GoalFitRow[];
  overall: { fit: number; grade: Grade; reasons: string[] } | null;
  /** Full "Why this score?" bullets — shown in the default (overall) hero only. */
  scoreReasons?: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = (searchParams.get("goal") ?? "balanced") as GoalId;

  const select = (id: GoalId) => {
    writeStoredGoal(id);
    const p = new URLSearchParams(searchParams.toString());
    if (id === "balanced") p.delete("goal");
    else p.set("goal", id);
    p.delete("allow_eggs");
    const q = p.toString();
    window.location.href = q ? `${pathname}?${q}` : pathname;
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
            reasons:
              scoreReasons && scoreReasons.length > 0
                ? scoreReasons.slice(0, 3)
                : overall.reasons.slice(0, 3),
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
            reasons: row.reasons,
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
      caption: scoreReasons?.[0] ?? overall.reasons[0] ?? "Nutrition + ingredients",
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
          caption={"caption" in activeRow ? activeRow.caption : undefined}
          fit={activeRow.fit}
          grade={activeRow.grade}
          reasons={activeRow.reasons}
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
  reasons,
}: {
  variant: "overall" | "goal";
  label?: string;
  caption?: string;
  fit: number;
  grade: Grade;
  reasons: string[];
}) {
  const bullets = reasons.filter(Boolean).slice(0, variant === "overall" ? 3 : 2);

  return (
    <div className="rounded-2xl border border-(--color-line) bg-linear-to-br from-white to-(--color-bg-soft) p-5 shadow-sm">
      <div className="flex items-start gap-5">
        <ScoreRing
          score={fit}
          size={88}
          stroke={6}
          showLabel
          subtitle={grade}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1 pt-1">
          {variant === "goal" && label ? (
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-(--color-fg-dim)">
              {label}
            </p>
          ) : null}
          {variant === "goal" && caption ? (
            <p className={cn("text-[15px] font-medium text-(--color-fg)", label ? "mt-1" : "")}>
              {caption}
            </p>
          ) : null}
          {bullets.length > 0 ? (
            <ul
              className={cn(
                "space-y-1.5 text-[14px] leading-snug text-(--color-fg-muted)",
                variant === "goal" && (label || caption) ? "mt-2.5" : "mt-0",
              )}
            >
              {bullets.map((r) => (
                <li key={r} className="flex gap-2">
                  <span className="text-(--color-fg-dim)">·</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
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
  const surface = fitTileSurface(fit);

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          "flex h-[88px] w-full flex-col justify-between rounded-xl border px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-sm",
          active && "ring-2 ring-(--color-fg)/20",
        )}
        style={surface}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-[12px] font-medium leading-tight text-(--color-fg)">{label}</span>
          <span
            className="font-display text-xl font-semibold leading-none tabular-nums"
            style={{ color: colorForScore(fit) }}
          >
            {grade}
          </span>
        </span>
        <span className="line-clamp-2 text-[11.5px] leading-tight text-(--color-fg-muted)">
          {caption}
        </span>
      </button>
    </li>
  );
}

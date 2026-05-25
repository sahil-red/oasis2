"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ScoreRing } from "@/components/score-ring";
import {
  readVegAllowEggs,
  writeStoredGoal,
  writeVegAllowEggs,
} from "@/lib/goals/storage";
import { parseVegAllowEggs } from "@/lib/products/catalog-filter";
import type { GoalFitRow } from "@/lib/goals/build-goal-rows";
import { GOAL_PROFILES, type GoalId } from "@/lib/goals/types";
import { fitVerdictLabel, scorePresentation, type FitVerdict } from "@/lib/goals/verdict";
import { cn, colorForScore, type Grade } from "@/lib/utils";

const VERDICT_STYLE: Record<FitVerdict, string> = {
  strong: "bg-emerald-50/80 text-emerald-800 ring-emerald-200/80",
  okay: "bg-amber-50/80 text-amber-900 ring-amber-200/80",
  weak: "bg-red-50/80 text-red-800 ring-red-200/80",
};

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
}: {
  rows: GoalFitRow[];
  overall: { fit: number; grade: Grade; reasons: string[] } | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = (searchParams.get("goal") ?? "balanced") as GoalId;

  const vegAllowEggs =
    searchParams.get("allow_eggs") != null
      ? parseVegAllowEggs(searchParams.get("allow_eggs"))
      : readVegAllowEggs();

  const select = (id: GoalId) => {
    writeStoredGoal(id);
    const p = new URLSearchParams(searchParams.toString());
    if (id === "balanced") p.delete("goal");
    else p.set("goal", id);
    if (id !== "veg") p.delete("allow_eggs");
    else if (vegAllowEggs) p.set("allow_eggs", "1");
    else p.delete("allow_eggs");
    const q = p.toString();
    window.location.href = q ? `${pathname}?${q}` : pathname;
  };

  const setVegAllowEggs = (allow: boolean) => {
    writeVegAllowEggs(allow);
    const p = new URLSearchParams(searchParams.toString());
    p.set("goal", "veg");
    if (allow) p.set("allow_eggs", "1");
    else p.delete("allow_eggs");
    window.location.href = `${pathname}?${p.toString()}`;
  };

  const profileLabel = (id: GoalId) =>
    GOAL_PROFILES.find((g) => g.id === id)?.label ?? id;

  const activeRow =
    active === "balanced"
      ? overall
        ? {
            id: "balanced" as const,
            label: profileLabel("balanced"),
            fit: overall.fit,
            grade: overall.grade,
            reasons: overall.reasons,
          }
        : null
      : (() => {
          const row = rows.find((r) => r.id === active);
          if (!row) return null;
          const pres = scorePresentation(row.fit);
          return {
            id: row.id,
            label: profileLabel(row.id),
            fit: row.fit,
            grade: pres.grade,
            reasons: row.reasons,
          };
        })();

  const gridGoals: { id: GoalId; label: string; fit: number; grade?: Grade }[] = [];
  if (overall) {
    gridGoals.push({
      id: "balanced",
      label: profileLabel("balanced"),
      fit: overall.fit,
      grade: overall.grade,
    });
  }
  for (const row of [...rows].sort((a, b) => b.fit - a.fit)) {
    gridGoals.push({
      id: row.id,
      label: profileLabel(row.id),
      fit: row.fit,
    });
  }

  const chipGoals = GOAL_PROFILES.filter(
    (g) => g.id === "balanced" || rows.some((r) => r.id === g.id),
  );

  return (
    <section className="mt-6">
      {activeRow ? (
        <ActiveGoalHero
          label={activeRow.label}
          fit={activeRow.fit}
          grade={activeRow.grade}
          reasons={activeRow.reasons}
        />
      ) : (
        <p className="rounded-xl border border-(--color-line) bg-(--color-bg-soft) px-4 py-3 text-sm text-(--color-fg-muted)">
          Score pending — goal fit will appear once nutrition is available.
        </p>
      )}

      {active === "veg" ? (
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-lg border border-(--color-line) bg-white px-3 py-2.5 text-[13px]">
          <input
            type="checkbox"
            checked={vegAllowEggs}
            onChange={(e) => setVegAllowEggs(e.target.checked)}
            className="h-4 w-4 rounded border-(--color-line) accent-(--color-fg)"
          />
          <span>
            <span className="font-medium text-(--color-fg)">Allow eggs</span>
            <span className="block text-[12px] text-(--color-fg-muted)">
              Uncheck for pure veg (no egg in ingredients).
            </span>
          </span>
        </label>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {chipGoals.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => select(g.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[13px] font-medium transition",
              active === g.id
                ? "bg-(--color-fg) text-(--color-bg)"
                : "bg-white text-(--color-fg-muted) ring-1 ring-(--color-line) hover:text-(--color-fg)",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      {gridGoals.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-(--color-fg-dim)">
            All goals at a glance
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
      ) : null}
    </section>
  );
}

function ActiveGoalHero({
  label,
  fit,
  grade,
  reasons,
}: {
  label: string;
  fit: number;
  grade: Grade;
  reasons: string[];
}) {
  const pres = scorePresentation(fit);
  const topReasons = reasons.slice(0, 2);

  return (
    <div className="rounded-2xl border border-(--color-line) bg-linear-to-br from-white to-(--color-bg-soft) p-5 shadow-sm">
      <div className="flex items-center gap-5">
        <ScoreRing
          score={fit}
          size={96}
          stroke={7}
          showLabel
          subtitle={`Grade ${grade}`}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-(--color-fg-dim)">
            {label}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 ring-inset",
                VERDICT_STYLE[pres.verdict],
              )}
            >
              {fitVerdictLabel(pres.verdict)}
            </span>
            <span className="text-[13px] text-(--color-fg-dim)">{pres.bandLabel}</span>
          </div>
          {topReasons.length > 0 ? (
            <ul className="mt-3 space-y-1 text-[14px] leading-snug text-(--color-fg-muted)">
              {topReasons.map((r) => (
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
  active,
  onSelect,
}: {
  label: string;
  fit: number;
  grade?: Grade;
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
        className={cn(
          "flex h-full w-full flex-col rounded-xl border px-3 py-2.5 text-left transition",
          active && "ring-2 ring-(--color-fg)/15",
        )}
        style={surface}
      >
        <span className="text-[12px] font-medium leading-tight text-(--color-fg)">{label}</span>
        <span
          className="mt-2 font-display text-2xl font-semibold leading-none tabular-nums"
          style={{ color: colorForScore(fit) }}
        >
          {grade}
        </span>
        <span
          className={cn(
            "mt-2 w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
            VERDICT_STYLE[pres.verdict],
          )}
        >
          {fitVerdictLabel(pres.verdict)}
        </span>
      </button>
    </li>
  );
}

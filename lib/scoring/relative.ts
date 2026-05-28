import type { RoleCohort } from "@/lib/scoring/role-cohort";

export const COHORT_MIN_SIZE = 8;

export function buildCohortId(
  category: string | null,
  subcategory: string | null,
  role_cohort: RoleCohort,
): string {
  const cat = (category ?? "_unknown").trim();
  const sub = (subcategory ?? "_any").trim();
  return `${cat}::${sub}::${role_cohort}`;
}

/** Percentile rank 0–100 (higher = better than more of cohort). */
export function percentileRank(value: number, cohortValues: number[]): number {
  if (!cohortValues.length) return value;
  const sorted = [...cohortValues].sort((a, b) => a - b);
  let below = 0;
  for (const v of sorted) {
    if (v < value) below++;
  }
  const pct = (below / sorted.length) * 100;
  return Math.round(Math.max(0, Math.min(100, pct)));
}

export function computeRelativeScore(
  absolute: number,
  cohortAbsolutes: number[],
): { relative: number; cohort_size: number } {
  const cohort_size = cohortAbsolutes.length;
  if (cohort_size < COHORT_MIN_SIZE) {
    return { relative: absolute, cohort_size };
  }
  return {
    relative: percentileRank(absolute, cohortAbsolutes),
    cohort_size,
  };
}

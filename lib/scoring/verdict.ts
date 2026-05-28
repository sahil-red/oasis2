import type { RoleCohort } from "@/lib/scoring/role-cohort";

export type VerdictId = "daily_staple" | "good_choice" | "occasional_treat" | "skip";

export const VERDICT_LABELS: Record<
  VerdictId,
  { title: string; description: string }
> = {
  daily_staple: {
    title: "Daily staple",
    description: "Whole foods, clean ingredients, no concern flags",
  },
  good_choice: {
    title: "Good choice",
    description: "Nutritious with minor trade-offs, or top of its cohort",
  },
  occasional_treat: {
    title: "Occasional treat",
    description: "Enjoy mindfully, not daily",
  },
  skip: {
    title: "Skip",
    description: "Avoid or only when nothing else is available",
  },
};

/** Deterministic top-level verdict — no LLM at display time. */
export function determineVerdict(opts: {
  absolute: number;
  role_cohort: RoleCohort;
  hazardous?: boolean;
}): VerdictId {
  if (opts.hazardous || opts.absolute < 40) return "skip";
  if (opts.role_cohort === "treat" || opts.absolute < 65) {
    if (opts.absolute >= 40) return "occasional_treat";
    return "skip";
  }
  if (opts.absolute >= 80 && opts.role_cohort === "staple") return "daily_staple";
  if (opts.absolute >= 65) return "good_choice";
  return "occasional_treat";
}

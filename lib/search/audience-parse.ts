import type { ParsedProductQuery } from "@/lib/search/query-parse";
import { applyGoalIntentHeuristics } from "@/lib/search/goal-intent-registry";

/** @deprecated Use applyGoalIntentHeuristics — kept for import stability. */
export function applyAudienceHeuristics(parsed: ParsedProductQuery, lower: string): void {
  applyGoalIntentHeuristics(parsed, lower);
}

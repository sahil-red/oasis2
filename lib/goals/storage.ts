import type { GoalId } from "./types";
import { goalFromParam } from "./types";

const KEY = "oasis-goal-v1";

export function readStoredGoal(): GoalId {
  if (typeof window === "undefined") return "balanced";
  try {
    const raw = localStorage.getItem(KEY);
    return goalFromParam(raw);
  } catch {
    return "balanced";
  }
}

export function writeStoredGoal(goal: GoalId): void {
  if (goal === "balanced") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, goal);
  window.dispatchEvent(new Event("oasis-goal"));
}

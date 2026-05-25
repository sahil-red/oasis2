import type { GoalId } from "./types";
import { goalFromParam } from "./types";

const KEY = "oasis-goal-v1";
const VEG_EGGS_KEY = "oasis-veg-eggs-v1";

export function readVegAllowEggs(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(VEG_EGGS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeVegAllowEggs(allow: boolean): void {
  if (typeof window === "undefined") return;
  if (allow) localStorage.setItem(VEG_EGGS_KEY, "1");
  else localStorage.removeItem(VEG_EGGS_KEY);
  window.dispatchEvent(new Event("oasis-veg-eggs"));
}

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

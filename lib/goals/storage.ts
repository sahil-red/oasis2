import type { GoalId } from "./types";
import { goalFromParam } from "./types";
import { readStoredKey } from "@/lib/storage/legacy";

const KEY = "scout-goal-v1";
const LEGACY_KEY = "oasis-goal-v1";
const EVENT = "scout-goal";

export function readStoredGoal(): GoalId {
  if (typeof window === "undefined") return "balanced";
  try {
    const raw = readStoredKey(KEY, LEGACY_KEY);
    return goalFromParam(raw);
  } catch {
    return "balanced";
  }
}

export function writeStoredGoal(goal: GoalId): void {
  if (goal === "balanced") localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, goal);
  window.dispatchEvent(new Event(EVENT));
}

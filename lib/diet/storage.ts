import { dietFromParam, type DietMode } from "./types";

const KEY = "oasis-diet-v1";
/** Legacy keys we still read for one cycle so users don't lose their setting. */
const LEGACY_VEG_EGGS_KEY = "oasis-veg-eggs-v1";
const LEGACY_GOAL_KEY = "oasis-goal-v1";

export function readDietMode(): DietMode {
  if (typeof window === "undefined") return "any";
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return dietFromParam(raw);
    // Migrate from older split state: goal=veg + allow_eggs flag.
    const legacyGoal = localStorage.getItem(LEGACY_GOAL_KEY);
    if (legacyGoal === "veg") {
      return localStorage.getItem(LEGACY_VEG_EGGS_KEY) === "1" ? "veg-eggs" : "veg";
    }
    if (legacyGoal === "vegan") return "vegan";
    return "any";
  } catch {
    return "any";
  }
}

export function writeDietMode(diet: DietMode): void {
  if (typeof window === "undefined") return;
  try {
    if (diet === "any") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, diet);
  } catch {
    /* ignore quota */
  }
  window.dispatchEvent(new Event("oasis-diet"));
}

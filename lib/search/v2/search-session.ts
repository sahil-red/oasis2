/**
 * Client-side last search context — wires goal learning to click tracking.
 */
const KEY = "scout_last_search_v2";

export type LastSearchContext = {
  query: string;
  goal_id: string | null;
  goal_phrase: string | null;
};

export function setLastSearchContext(ctx: LastSearchContext): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {
    // ignore quota
  }
}

export function getLastSearchContext(): LastSearchContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastSearchContext;
  } catch {
    return null;
  }
}

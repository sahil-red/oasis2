const KEY = "scout-recent-searches-v1";
const MAX = 5;

export function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** Most-recent-first, deduped case-insensitively, capped at MAX. */
export function recordRecentSearch(prompt: string): string[] {
  const trimmed = prompt.trim();
  if (!trimmed || typeof window === "undefined") return readRecentSearches();
  const seen = new Set([trimmed.toLowerCase()]);
  const next = [trimmed];
  for (const old of readRecentSearches()) {
    const key = old.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(old);
    if (next.length >= MAX) break;
  }
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearRecentSearches(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

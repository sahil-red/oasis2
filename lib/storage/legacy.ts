/** Read a localStorage key, falling back to a legacy Oasis-prefixed key once. */
export function readStoredKey(key: string, legacyKey: string): string | null {
  if (typeof window === "undefined") return null;
  const current = localStorage.getItem(key);
  if (current != null) return current;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy != null) {
    localStorage.setItem(key, legacy);
    return legacy;
  }
  return null;
}

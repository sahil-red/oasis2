/** In-DB candidate retrieval (pgvector) instead of loading the full index into memory. */
export function isPgvectorMode(): boolean {
  const v = process.env.SEARCH_V2_PGVECTOR;
  return v === "1" || v === "true";
}

/** Search V2 feature flag — enabled when pgvector mode is on or explicitly set. */
export function isSearchV2Enabled(): boolean {
  if (isPgvectorMode()) return true;
  if (process.env.SEARCH_V2_ENABLED === "1" || process.env.SEARCH_V2_ENABLED === "true") {
    return true;
  }
  if (typeof process.env.NEXT_PUBLIC_SEARCH_V2_ENABLED === "string") {
    const pub = process.env.NEXT_PUBLIC_SEARCH_V2_ENABLED.toLowerCase();
    return pub === "1" || pub === "true";
  }
  return false;
}

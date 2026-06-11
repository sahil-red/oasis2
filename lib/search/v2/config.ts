/** Search V2 is the only search path. Always enabled. */
export function isSearchV2Enabled(): boolean {
  return true;
}

/** In-DB candidate retrieval is the only path. Always enabled. */
export function isPgvectorMode(): boolean {
  return true;
}

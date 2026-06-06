/**
 * §12 India synonym map — lexicon data, not per-query rules.
 * Used by intent (online) and enrichment (offline type_aliases).
 */
export const TYPE_SYNONYMS: Record<string, string[]> = {
  milk: ["doodh", "dudh"],
  atta: ["flour", "wheat flour"],
  ghee: ["ghi", "desi ghee"],
  curd: ["dahi", "yogurt", "yoghurt"],
  biscuit: ["biscuits", "cookie", "cookies"],
  namkeen: ["bhujia", "sev", "chivda"],
  smoothie: ["smoothies"],
  juice: ["juices"],
  oats: ["oatmeal"],
  snack: ["snacks", "namkeen", "chips", "biscuit", "cookies", "bhujia", "sev"],
};

/** Expand a canonical type to itself + synonyms (§6 type ∈ {type,synonyms}). */
export function expandTypeSynonyms(type: string | null): string[] {
  if (!type) return [];
  const key = type.toLowerCase();
  const aliases = TYPE_SYNONYMS[key] ?? [];
  return [key, ...aliases.map((a) => a.toLowerCase())];
}

/** Resolve a token to canonical type if it is a known synonym. */
export function canonicalTypeFromToken(token: string): string | null {
  const t = token.toLowerCase();
  if (TYPE_SYNONYMS[t]) return t;
  for (const [canonical, syns] of Object.entries(TYPE_SYNONYMS)) {
    if (syns.some((s) => s.toLowerCase() === t)) return canonical;
  }
  return null;
}

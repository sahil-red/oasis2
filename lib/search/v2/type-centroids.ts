/**
 * Data-driven type semantics — answers come from `type_centroids` (avg product
 * embedding per primary_type, refreshed in-DB after index builds).
 *
 * Two questions, one cached RPC call per type:
 *   - equivalents: types that ARE the asked type (plural/synonym variants —
 *     "biscuit" ≡ "biscuits" ≡ "cookie" at centroid distance ≤ EQUIVALENT_MAX)
 *   - neighbors: nearby-but-distinct types (relaxation hints — "smoothie" →
 *     "milkshake", "yogurt drink")
 *
 * Replaces the dead per-row type_embedding tier AND the hardcoded
 * KNOWN_NEIGHBORS list. Unknown query types (not in the catalog vocabulary)
 * fall back to embedding the term and matching against centroids in-DB.
 */
import { adminClient } from "@/lib/supabase/admin";
import { cosineSimilarity, embedText } from "@/lib/search/v2/embeddings";

/** Cosine-distance bands over type centroids. Same product class ≤ EQUIVALENT_MAX;
 *  related-but-distinct ≤ NEIGHBOR_MAX. Both act on one observable quantity and
 *  every consumer treats them softly (extra recall / hints — never exclusion).
 *  Calibrated on observed pairs: true equivalents sit ≤0.04 (biscuit→biscuits
 *  0.008, →cookie 0.021, →cream biscuit 0.030) while distinct-but-related types
 *  sit ≥0.08 (tofu→paneer 0.088, →soya chunks 0.102). */
const EQUIVALENT_MAX = 0.05;
const NEIGHBOR_MAX = 0.3;
const FETCH_LIMIT = 24;
const TTL_MS = 15 * 60_000;

/** Module-level cache: type centroids pre-loaded from the index snapshot.
 *  When set, semanticTypeMatches() computes cosine distances in-memory (~2ms)
 *  instead of calling the 8s Supabase RPC. */
let _typeCentroids: Map<string, number[]> | null = null;

/** Called by the pipeline after the snapshot is loaded. */
export function setTypeCentroids(centroids: Map<string, number[]> | null): void {
  _typeCentroids = centroids;
}

/** Category→primary_type sibling map — loaded at snapshot time from the
 *  product_search_index taxonomy. Used to expand type matching when centroids
 *  are sparse ("snacks" → chips, namkeen, protein bar in category "munchies"). */
let _categoryTypeMap: Map<string, string[]> | null = null;

export function setCategoryTypeMap(map: Map<string, string[]> | null): void {
  _categoryTypeMap = map;
}

/** Auto-detected type normalisation — sparse → dominant twin lookup.
 *  "milk shake" → "milkshake". Loaded at snapshot time. */
let _typeNormalize: Map<string, string> | null = null;

export function setTypeNormalize(map: Map<string, string> | null): void {
  _typeNormalize = map;
}

type TypeMatch = { primary_type: string; distance: number };
const cache = new Map<string, { at: number; matches: TypeMatch[] }>();

// All known primary_types from type_centroids — cached for word-level fallback
// when a specific type has too few products to have a centroid.
let allKnownTypesCache: { at: number; types: string[] } | null = null;

async function getAllKnownTypes(): Promise<string[]> {
  if (allKnownTypesCache && Date.now() - allKnownTypesCache.at < TTL_MS) {
    return allKnownTypesCache.types;
  }
  try {
    const supabase = adminClient();
    // Use the facets RPC to get ALL types — bypasses PostgREST's 1000-row
    // default limit on the free tier (type_centroids has 1086 rows).
    const { data } = await supabase.rpc("search_v2_facets");
    const obj = (data ?? {}) as { primary_types?: string[] };
    const types = (obj.primary_types ?? []).map((t) => t.toLowerCase());
    allKnownTypesCache = { at: Date.now(), types };
    return types;
  } catch {
    return allKnownTypesCache?.types ?? [];
  }
}

async function fetchMatches(wanted: string): Promise<TypeMatch[]> {
  const key = wanted.trim().toLowerCase();
  if (!key) return [];
  const hit = cache.get(key);
  // Return cached result only if it has enough matches — if ≤1 match, the
  // word-level fallback hasn't been applied, so fall through to recompute.
  if (hit && Date.now() - hit.at < TTL_MS && hit.matches.length > 1) return hit.matches;

  // Offline / env-less contexts (regression harness, evals) degrade to "no
  // matches" — exact + lexical type matching still work without centroids.
  let supabase: ReturnType<typeof adminClient>;
  try {
    supabase = adminClient();
  } catch {
    return [];
  }
  let matches: TypeMatch[] = [];
  try {
    const { data } = await supabase.rpc("search_v2_type_matches", {
      p_type: key,
      p_max_distance: NEIGHBOR_MAX,
      p_limit: FETCH_LIMIT,
    });
    if (Array.isArray(data) && data.length) {
      matches = (data as TypeMatch[]).map((d) => ({
        primary_type: String(d.primary_type).toLowerCase(),
        distance: Number(d.distance),
      }));
    } else {
      // Unknown type (not a catalog primary_type) — match by embedding the term.
      const vec = await embedText(key, "query");
      if (vec.length) {
        const { data: byVec } = await supabase.rpc("search_v2_type_matches_vec", {
          p_vec: `[${vec.join(",")}]`,
          p_max_distance: NEIGHBOR_MAX,
          p_limit: FETCH_LIMIT,
        });
        if (Array.isArray(byVec)) {
          matches = (byVec as TypeMatch[]).map((d) => ({
            primary_type: String(d.primary_type).toLowerCase(),
            distance: Number(d.distance),
          }));
        }
      }
    }
  } catch {
    matches = [];
  }

  // Word-level fallback: when a type has few products, the centroid has
  // weak neighbor matches. Extend by substring-matching against all known types.
  // "greek yogurt" (1 product) → add "yogurt", "frozen yogurt", etc.
  if (key.length >= 3) {
    const words = key.split(/\s+/).filter((w) => w.length >= 4);
    if (words.length) {
      const allTypes = await getAllKnownTypes();
      const fallback = allTypes
        .filter((t) => t !== key && words.some((w) => t.includes(w)))
        // Sort by relevance: more shared words = higher rank.
        // Tiebreak: shorter name first (base types before compound)
        .sort((a, b) => {
          const aScore = words.filter((w) => a.includes(w)).length;
          const bScore = words.filter((w) => b.includes(w)).length;
          if (aScore !== bScore) return bScore - aScore;
          return a.length - b.length;
        })
        .slice(0, 5)  // Keep only the 5 most relevant fallback types
        .map((t) => ({ primary_type: t, distance: 0.04 }));
      const existing = new Set(matches.map((m) => m.primary_type));
      for (const f of fallback) {
        if (!existing.has(f.primary_type)) matches.push(f);
      }
    }
  }

  cache.set(key, { at: Date.now(), matches });
  return matches;
}

/** Catalog types semantically equivalent to `wanted` (includes `wanted` itself). */
export async function semanticTypeMatches(wanted: string): Promise<Set<string>> {
  const key = wanted.trim().toLowerCase();
  const out = new Set<string>(key ? [key] : []);

  // Normalize sparse types to dominant twins for centroid lookup.
  // "milk shake" (1 product) uses the "milkshake" (81) centroid, but
  // BOTH original types appear in results — products of both are shown.
  const lookupKey = _typeNormalize?.get(key) ?? key;

  // In-memory path: compute cosine distance against all pre-loaded centroids.
  // ~2ms for 1,086 comparisons vs. 8s for the Supabase RPC.
  if (_typeCentroids?.has(lookupKey)) {
    const wantedVec = _typeCentroids.get(lookupKey)!;
    for (const [type, vec] of _typeCentroids) {
      if (type === lookupKey) continue;
      const sim = cosineSimilarity(wantedVec, vec);
      const dist = 1 - sim;
      if (dist <= EQUIVALENT_MAX) out.add(type);
    }
    // Category sibling expansion: when centroids are sparse, add same-category
    // types from the taxonomy. Only expand for narrow categories (≤30 types).
    const centroidOnlyCount = out.size;
    if (centroidOnlyCount <= 3 && _categoryTypeMap) {
      const siblings = _categoryTypeMap.get(lookupKey);
      if (siblings && siblings.length <= 30) {
        for (const s of siblings) {
          if (s !== lookupKey && out.size < 24) out.add(s);
        }
      }
    }
    // Always include the original key itself (may differ from lookupKey)
    out.add(key);
    // Also include the normalized lookup key — e.g. "milk shake" (1 product)
    // must also match "milkshake" (81 products) since they share the same centroid.
    if (lookupKey !== key) out.add(lookupKey);
    return out;
  }

  // Fallback: RPC path (for types not in centroids, or pre-snapshot load).
  // Also normalize the lookup key for the RPC.
  for (const m of await fetchMatches(lookupKey)) {
    if (m.distance <= EQUIVALENT_MAX) out.add(m.primary_type);
  }
  out.add(key);
  if (lookupKey !== key) out.add(lookupKey);
  return out;
}

/** Nearby-but-distinct types — relaxation hints, ordered by closeness. */
export async function nearestTypesFromCentroids(wanted: string, limit = 5): Promise<string[]> {
  const key = wanted.trim().toLowerCase();
  const out: string[] = [];
  for (const m of await fetchMatches(key)) {
    if (m.distance > EQUIVALENT_MAX && m.distance <= NEIGHBOR_MAX) out.push(m.primary_type);
    if (out.length >= limit) break;
  }
  return out;
}

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
import { embedText } from "@/lib/search/v2/embeddings";

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

type TypeMatch = { primary_type: string; distance: number };
const cache = new Map<string, { at: number; matches: TypeMatch[] }>();

async function fetchMatches(wanted: string): Promise<TypeMatch[]> {
  const key = wanted.trim().toLowerCase();
  if (!key) return [];
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.matches;

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
  cache.set(key, { at: Date.now(), matches });
  return matches;
}

/** Catalog types semantically equivalent to `wanted` (includes `wanted` itself). */
export async function semanticTypeMatches(wanted: string): Promise<Set<string>> {
  const key = wanted.trim().toLowerCase();
  const out = new Set<string>(key ? [key] : []);
  for (const m of await fetchMatches(key)) {
    if (m.distance <= EQUIVALENT_MAX) out.add(m.primary_type);
  }
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

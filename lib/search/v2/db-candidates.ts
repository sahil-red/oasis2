/**
 * In-DB candidate retrieval (pgvector) — two parallel legs, unioned:
 *
 *  (a) ANN leg: search_v2_rows — cosine KNN over the whole index, slim jsonb
 *      rows + distance in ONE round-trip. Deliberately untyped: a selective
 *      WHERE on top of an ivfflat probe starves recall (the probed lists may
 *      contain zero rows of a rare type — 19 tofu products existed, ANN+filter
 *      returned 0).
 *  (b) typed leg: search_v2_typed_rows — exact primary_type fetch (B-tree, no
 *      ANN) for the asked type AND its centroid-equivalent types ("biscuit" ≡
 *      "biscuits" ≡ "cookie"). Guarantees every product of the asked type is
 *      in the pool regardless of ANN probe luck.
 *
 * Egress: ~3KB/row slim jsonb; vectors never leave the database.
 */
import { adminClient } from "@/lib/supabase/admin";
import { embedText } from "@/lib/search/v2/embeddings";
import { mapDbRow } from "@/lib/search/v2/index-queries";
import { semanticTypeMatches } from "@/lib/search/v2/type-centroids";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN } from "@/lib/search/v2/types";

type RpcRow = { row_json: Record<string, unknown>; distance: number | null };
const MAX_TYPED_TYPES = 4;

function mapRpcRows(data: unknown): ProductSearchIndexRow[] {
  if (!Array.isArray(data)) return [];
  const out: ProductSearchIndexRow[] = [];
  for (const r of data as RpcRow[]) {
    if (!r?.row_json) continue;
    const mapped = mapDbRow(r.row_json);
    mapped.knn_distance = r.distance != null ? Number(r.distance) : null;
    out.push(mapped);
  }
  return out;
}

export async function fetchCandidatePool(
  intent: SearchIntentV2,
  minQuality = DATA_QUALITY_MIN,
  limit = 200,
): Promise<ProductSearchIndexRow[]> {
  const supabase = adminClient();

  const queryEmbed = await embedText(intent.raw_query, "query");
  const vecStr = queryEmbed.length ? `[${queryEmbed.join(",")}]` : null;

  // Typed leg covers the asked type + its semantic equivalents (cached lookup).
  const wanted = intent.primary_type?.trim().toLowerCase() ?? null;
  const typedTypes = wanted
    ? [...(await semanticTypeMatches(wanted))].slice(0, MAX_TYPED_TYPES)
    : [];

  const annPromise = vecStr
    ? supabase.rpc("search_v2_rows", {
        p_query_embedding: vecStr,
        p_limit: limit,
        p_min_quality: minQuality,
      })
    : Promise.resolve({ data: null, error: null });

  const typedPromises = typedTypes.map((t) =>
    supabase.rpc("search_v2_typed_rows", {
      p_primary_type: t,
      p_query_embedding: vecStr,
      p_limit: limit,
      p_min_quality: minQuality,
    }),
  );

  const [ann, ...typed] = await Promise.all([annPromise, ...typedPromises]);

  if (ann.error) console.warn("[db-candidates] ANN RPC failed:", ann.error.message);
  for (const t of typed) {
    if (t.error) console.warn("[db-candidates] typed RPC failed:", t.error.message);
  }

  // Union, typed-first so exact-type rows always survive the dedupe.
  const byId = new Map<string, ProductSearchIndexRow>();
  for (const t of typed) {
    for (const row of mapRpcRows(t.data)) byId.set(row.product_id, row);
  }
  for (const row of mapRpcRows(ann.data)) {
    if (!byId.has(row.product_id)) byId.set(row.product_id, row);
  }

  // Distance-ordered pool (nulls last) — downstream RRF uses knn_distance.
  return [...byId.values()].sort(
    (a, b) => (a.knn_distance ?? Infinity) - (b.knn_distance ?? Infinity),
  );
}

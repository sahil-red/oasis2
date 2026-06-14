import { adminClient } from "@/lib/supabase/admin";
import { buildIndexCatalogMeta, type IndexCatalogMeta } from "@/lib/search/v2/index-meta";
import { embedText } from "@/lib/search/v2/embeddings";
import { SEED_GOAL_TRAIT_MAP } from "@/lib/search/v2/goal-graph";
import type {
  CategoryTraitProfileRow,
  DietaryPrevalenceMap,
  GoalTraitMapRow,
  ProductSearchIndexRow,
} from "@/lib/search/v2/types";

export type SearchIndexSnapshot = {
  index: ProductSearchIndexRow[];
  profiles: CategoryTraitProfileRow[];
  goalMap: Map<string, GoalTraitMapRow>;
  catalogMeta: IndexCatalogMeta;
  source: "db" | "memory" | "pgvector";
  dietary_prevalence: DietaryPrevalenceMap;
  /** Pre-loaded type centroids for in-memory cosine matching — avoids
   *  8s RPC calls to search_v2_type_matches. Populated during snapshot init. */
  typeCentroids: Map<string, number[]>;
  /** Category→primary_type siblings — built from product_search_index at
   *  snapshot load. Expands type matching for weak centroids (snacks→chips). */
  categoryTypeMap: Map<string, string[]> | null;
  /** Lazy-loaded — populated on first access, not during snapshot init */
  _goalMapLoaded: boolean;
  _profilesLoaded: boolean;
};

async function loadFacets(): Promise<IndexCatalogMeta> {
  // Prefer static JSON (0ms, built during index rebuild).
  // Falls back to Supabase summary table → RPC → empty.
  try {
    const { brands, primary_types } = await import("@/data/catalog-facets.json") as {
      brands: string[];
      primary_types: string[];
    };
    if (brands?.length) {
      return {
        brands: new Set(brands.map((b) => b.toLowerCase())),
        primaryTypes: new Set((primary_types ?? []).map((t) => t.toLowerCase())),
        flavours: new Set(),
      };
    }
  } catch { /* file missing — fall through to Supabase */ }

  try {
    const supabase = adminClient();
    // Try the cached summary table (~50ms vs 1-2s RPC)
    const { data: cached } = await supabase
      .from("catalog_facets")
      .select("brands, primary_types")
      .eq("id", 1)
      .maybeSingle();
    const row = cached as { brands?: string[]; primary_types?: string[] } | null;
    if (row?.brands?.length) {
      return {
        brands: new Set(row.brands.map((b) => b.toLowerCase())),
        primaryTypes: new Set((row.primary_types ?? []).map((t) => t.toLowerCase())),
        flavours: new Set(),
      };
    }
    // Last resort: slow RPC
    const { data } = await supabase.rpc("search_v2_facets");
    const obj = (data ?? {}) as { brands?: string[]; primary_types?: string[]; flavours?: string[] };
    return {
      brands: new Set((obj.brands ?? []).map((b) => b.toLowerCase())),
      primaryTypes: new Set((obj.primary_types ?? []).map((t) => t.toLowerCase())),
      flavours: new Set((obj.flavours ?? []).map((f) => f.toLowerCase())),
    };
  } catch {
    return { brands: new Set(), primaryTypes: new Set(), flavours: new Set() };
  }
}

let cachedSnapshot: { data: SearchIndexSnapshot; at: number } | null = null;
const SNAPSHOT_TTL_MS = 60 * 60 * 1000;

function parseVector(raw: unknown): number[] | null {
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as number[];
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function mapDbRow(raw: Record<string, unknown>): ProductSearchIndexRow {
  return {
    product_id: String(raw.product_id),
    canonical_product_id: raw.canonical_product_id ? String(raw.canonical_product_id) : null,
    slug: String(raw.slug),
    name: String(raw.name),
    brand: (raw.brand as string) ?? null,
    category: (raw.category as string) ?? null,
    subcategory: (raw.subcategory as string) ?? null,
    l3_category: (raw.l3_category as string) ?? null,
    primary_type: (raw.primary_type as string) ?? null,
    base_name: (raw.base_name as string) ?? null,
    form: (raw.form as string) ?? null,
    flavours: (raw.flavours as string[]) ?? [],
    variants: (raw.variants as string[]) ?? [],
    is_veg: (raw.is_veg as boolean) ?? null,
    is_vegan: (raw.is_vegan as boolean) ?? null,
    is_gluten_free: (raw.is_gluten_free as boolean) ?? null,
    is_jain: (raw.is_jain as boolean) ?? null,
    is_palm_oil_free: (raw.is_palm_oil_free as boolean) ?? null,
    has_added_sugar: (raw.has_added_sugar as boolean) ?? null,
    allergens: (raw.allergens as string[]) ?? [],
    claims: (raw.claims as string[]) ?? [],
    sugar_g: raw.sugar_g != null ? Number(raw.sugar_g) : null,
    protein_g: raw.protein_g != null ? Number(raw.protein_g) : null,
    fat_g: raw.fat_g != null ? Number(raw.fat_g) : null,
    saturated_fat_g: raw.saturated_fat_g != null ? Number(raw.saturated_fat_g) : null,
    calcium_mg: raw.calcium_mg != null ? Number(raw.calcium_mg) : null,
    iron_mg: raw.iron_mg != null ? Number(raw.iron_mg) : null,
    fiber_g: raw.fiber_g != null ? Number(raw.fiber_g) : null,
    carbs_g: raw.carbs_g != null ? Number(raw.carbs_g) : null,
    sodium_mg: raw.sodium_mg != null ? Number(raw.sodium_mg) : null,
    energy_kcal: raw.energy_kcal != null ? Number(raw.energy_kcal) : null,
    total_protein_g: raw.total_protein_g != null ? Number(raw.total_protein_g) : null,
    total_sugar_g: raw.total_sugar_g != null ? Number(raw.total_sugar_g) : null,
    total_fat_g: raw.total_fat_g != null ? Number(raw.total_fat_g) : null,
    total_calories: raw.total_calories != null ? Number(raw.total_calories) : null,
    price_inr: raw.price_inr != null ? Number(raw.price_inr) : null,
    sugar_tier: (raw.sugar_tier as ProductSearchIndexRow["sugar_tier"]) ?? null,
    protein_tier: (raw.protein_tier as ProductSearchIndexRow["protein_tier"]) ?? null,
    fat_tier: (raw.fat_tier as ProductSearchIndexRow["fat_tier"]) ?? null,
    traits: (raw.traits as ProductSearchIndexRow["traits"]) ?? {},
    trait_source: (raw.trait_source as ProductSearchIndexRow["trait_source"]) ?? {},
    trait_confidence: (raw.trait_confidence as ProductSearchIndexRow["trait_confidence"]) ?? {},
    trait_reasons: (raw.trait_reasons as ProductSearchIndexRow["trait_reasons"]) ?? {},
    scout_score: raw.scout_score != null ? Number(raw.scout_score) : null,
    nova_group: raw.nova_group != null ? Number(raw.nova_group) : null,
    data_quality_score: Number(raw.data_quality_score ?? 0),
    data_completeness: Number(raw.data_completeness ?? 0),
    facet_confidence: (raw.facet_confidence as Record<string, number>) ?? {},
    brand_tier: (raw.brand_tier as string) ?? null,
    pack_size_value: raw.pack_size_value != null ? Number(raw.pack_size_value) : null,
    pack_size_unit: (raw.pack_size_unit as string) ?? null,
    use_cases: (raw.use_cases as string[]) ?? [],
    search_doc: (raw.search_doc as string) ?? null,
    embedding: parseVector(raw.embedding),
    type_embedding: parseVector(raw.type_embedding),
    click_count: Number(raw.click_count ?? 0),
    save_count: Number(raw.save_count ?? 0),
    last_interaction_at: (raw.last_interaction_at as string) ?? null,
    built_at: (raw.built_at as string) ?? null,
    source_hash: (raw.source_hash as string) ?? null,
  };
}

async function loadGoalMapFromDb(): Promise<Map<string, GoalTraitMapRow>> {
  const map = new Map<string, GoalTraitMapRow>();

  // DB FIRST — rows carry persisted goal embeddings (seeded at build time).
  // The old order embedded every seed via Voyage on each cold instance and then
  // immediately overwrote them with these DB rows: ~16 wasted network calls on
  // the cold path. A populated table now costs ZERO embedding calls.
  try {
    const supabase = adminClient();
    const { data } = await supabase.from("goal_trait_map").select("*");
    for (const row of data ?? []) {
      map.set(String(row.goal_id), {
        goal_id: String(row.goal_id),
        goal_phrase: String(row.goal_phrase ?? row.display_name),
        display_name: String(row.display_name),
        trait_weights: (row.trait_weights as GoalTraitMapRow["trait_weights"]) ?? {},
        goal_embedding: parseVector(row.goal_embedding),
        source: String(row.source ?? "seed"),
        confidence: Number(row.confidence ?? 1),
        support_count: Number(row.support_count ?? 0),
      });
    }
  } catch {
    // table may not exist
  }

  // Embed only the gaps (fresh env / seed missing or stored without embedding).
  const missing = SEED_GOAL_TRAIT_MAP.filter(
    (seed) => !map.get(seed.goal_id)?.goal_embedding?.length,
  );
  if (missing.length) {
    const embeds = await Promise.all(
      missing.map((seed) => embedText(seed.goal_phrase, "document")),
    );
    missing.forEach((seed, i) => {
      const embed = embeds[i] ?? [];
      map.set(seed.goal_id, {
        ...seed,
        goal_embedding: embed.length ? embed : null,
      });
    });
  }
  return map;
}

async function loadProfilesFromDb(): Promise<CategoryTraitProfileRow[] | null> {
  try {
    const supabase = adminClient();
    const { data, error } = await supabase.from("category_trait_profile").select("*");
    if (error || !data?.length) return null;
    return data.map((row) => ({
      category_key: String(row.category_key),
      category: (row.category as string) ?? null,
      subcategory: (row.subcategory as string) ?? null,
      trait_means: (row.trait_means as CategoryTraitProfileRow["trait_means"]) ?? {},
      trait_centroid: parseVector(row.trait_centroid),
      product_count: Number(row.product_count ?? 0),
    }));
  } catch {
    return null;
  }
}

/** Slim column list — everything the ranking pipeline reads EXCEPT the two 1024-dim
 *  vectors (~24KB/row as JSON). Vector relevance arrives as knn_distance from the RPC. */
export const INDEX_COLUMNS =
  "product_id,canonical_product_id,slug,name,brand,category,subcategory,l3_category,primary_type,base_name,form,flavours,variants,is_veg,is_vegan,is_gluten_free,is_jain,is_palm_oil_free,has_added_sugar,allergens,claims,sugar_g,protein_g,fat_g,saturated_fat_g,sodium_mg,energy_kcal,total_protein_g,total_sugar_g,total_fat_g,total_calories,calcium_mg,iron_mg,fiber_g,carbs_g,price_inr,sugar_tier,protein_tier,fat_tier,traits,trait_source,trait_confidence,trait_reasons,scout_score,nova_group,data_quality_score,data_completeness,facet_confidence,brand_tier,pack_size_value,pack_size_unit,use_cases,search_doc,click_count,save_count,last_interaction_at,built_at,source_hash";

async function loadIndexFromDb(): Promise<ProductSearchIndexRow[] | null> {
  try {
    const supabase = adminClient();
    // Paginate — PostgREST caps a single response at ~1000 rows. Pages carry
    // ~12KB of embedding JSON per row, so SEQUENTIAL paging made cold starts
    // pay 17+ serial round-trips (10s+). Count first, then fetch all pages in
    // parallel waves — cold load drops to roughly the latency of one page.
    const PAGE = 1000;
    // 3 concurrent pages is the sweet spot on the current DB tier: each page
    // carries ~12MB of embedding JSON, and wider waves contend on I/O until
    // every statement hits the timeout. One retry per page, partial-tolerant.
    const CONCURRENCY = 3;

    const { count, error: countErr } = await supabase
      .from("product_search_index")
      .select("*", { count: "exact", head: true });
    if (countErr || !count) return null;

    const fetchPage = async (p: number): Promise<Record<string, unknown>[]> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await supabase
          .from("product_search_index")
          .select(INDEX_COLUMNS)
          .order("product_id", { ascending: true })
          .range(p * PAGE, p * PAGE + PAGE - 1);
        if (!error) return (data ?? []) as Record<string, unknown>[];
      }
      return [];
    };

    const pageCount = Math.ceil(Math.min(count, 50_000) / PAGE);
    const pages: Record<string, unknown>[][] = new Array(pageCount);
    for (let wave = 0; wave < pageCount; wave += CONCURRENCY) {
      const slice = Array.from(
        { length: Math.min(CONCURRENCY, pageCount - wave) },
        (_, i) => wave + i,
      );
      const results = await Promise.all(slice.map(fetchPage));
      slice.forEach((p, i) => {
        pages[p] = results[i];
      });
    }

    const all: ProductSearchIndexRow[] = [];
    for (const page of pages) {
      for (const row of page ?? []) all.push(mapDbRow(row));
    }
    return all.length ? all : null;
  } catch {
    return null;
  }
}

/** Compute dietary attribute prevalence per primary_type via a lightweight COUNT query.
 *  Avoids loading the full index (which is never populated in the snapshot). */
async function loadDietaryPrevalence(): Promise<DietaryPrevalenceMap> {
  try {
    const supabase = adminClient();
    const { data, error } = await supabase.rpc("search_v2_dietary_prevalence");
    if (!error && data) {
      const out: DietaryPrevalenceMap = {};
      for (const row of data as Array<{
        primary_type: string;
        total: number;
        vegan: number;
        gf: number;
        pof: number;
        jain: number;
      }>) {
        const t = row.primary_type || "unknown";
        out[t] = {
          total: row.total,
          is_vegan: row.total > 0 ? row.vegan / row.total : 0,
          is_gluten_free: row.total > 0 ? row.gf / row.total : 0,
          is_palm_oil_free: row.total > 0 ? row.pof / row.total : 0,
          is_jain: row.total > 0 ? row.jain / row.total : 0,
        };
      }
      return out;
    }
    // Fallback: direct query if RPC doesn't exist yet
    const { data: fallback } = await supabase
      .from("product_search_index")
      .select("primary_type, is_vegan, is_gluten_free, is_palm_oil_free, is_jain");
    if (!fallback) return {};
    const byType = new Map<string, { total: number; vegan: number; gf: number; pof: number; jain: number }>();
    for (const r of fallback as Array<{
      primary_type: string | null;
      is_vegan: boolean | null;
      is_gluten_free: boolean | null;
      is_palm_oil_free: boolean | null;
      is_jain: boolean | null;
    }>) {
      const t = r.primary_type || "unknown";
      let bucket = byType.get(t);
      if (!bucket) {
        bucket = { total: 0, vegan: 0, gf: 0, pof: 0, jain: 0 };
        byType.set(t, bucket);
      }
      bucket.total++;
      if (r.is_vegan) bucket.vegan++;
      if (r.is_gluten_free) bucket.gf++;
      if (r.is_palm_oil_free) bucket.pof++;
      if (r.is_jain) bucket.jain++;
    }
    const out: DietaryPrevalenceMap = {};
    for (const [type, bucket] of byType) {
      out[type] = {
        total: bucket.total,
        is_vegan: bucket.total > 0 ? bucket.vegan / bucket.total : 0,
        is_gluten_free: bucket.total > 0 ? bucket.gf / bucket.total : 0,
        is_palm_oil_free: bucket.total > 0 ? bucket.pof / bucket.total : 0,
        is_jain: bucket.total > 0 ? bucket.jain / bucket.total : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function clearSearchIndexSnapshotCache(): void {
  cachedSnapshot = null;
}

/** Load all type centroids from the DB — ~1,086 rows, ~5 MB in memory.
 *  Enables in-memory cosine matching instead of the 8s RPC call. */
async function loadTypeCentroids(): Promise<Map<string, number[]>> {
  const supabase = adminClient();
  const centroids = new Map<string, number[]>();
  const PAGE = 1000;
  for (let page = 0; page < 5; page++) {
    const { data, error } = await supabase
      .from("type_centroids")
      .select("primary_type, centroid")
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error || !data?.length) break;
    for (const r of data) {
      if (r.centroid) centroids.set((r.primary_type as string).toLowerCase(), r.centroid as number[]);
    }
  }
  return centroids;
}

/** Build category→primary_type sibling map from the search index.
 *  Used to expand type matching when centroids are sparse —
 *  "snacks" in category "munchies" also matches chips, namkeen, etc. */
async function loadCategoryTypeMap(): Promise<Map<string, string[]>> {
  const supabase = adminClient();
  const catMap = new Map<string, string[]>();
  const typeCatCount = new Map<string, Map<string, number>>(); // type → category → count
  const PAGE = 2000;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from("product_search_index")
      .select("category, primary_type")
      .not("primary_type", "is", null)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error || !data?.length) break;
    for (const r of data) {
      const cat = (r.category ?? "").trim();
      const pt = (r.primary_type as string).toLowerCase().trim();
      if (!cat || !pt) continue;
      if (!catMap.has(cat)) catMap.set(cat, []);
      const siblings = catMap.get(cat)!;
      if (!siblings.includes(pt)) siblings.push(pt);
      // Track category counts per type
      if (!typeCatCount.has(pt)) typeCatCount.set(pt, new Map());
      const counts = typeCatCount.get(pt)!;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }
  // For each primary_type, pick its dominant category (most products) and return siblings
  const typeToSiblings = new Map<string, string[]>();
  for (const [pt, catCounts] of typeCatCount) {
    let bestCat = "";
    let bestCount = 0;
    for (const [cat, count] of catCounts) {
      if (count > bestCount) { bestCat = cat; bestCount = count; }
    }
    const siblings = (catMap.get(bestCat) ?? []).filter(s => s !== pt);
    typeToSiblings.set(pt, siblings);
  }
  return typeToSiblings;
}

export async function getSearchIndexSnapshot(forceRefresh = false): Promise<SearchIndexSnapshot> {
  if (!forceRefresh && cachedSnapshot && Date.now() - cachedSnapshot.at < SNAPSHOT_TTL_MS) {
    return cachedSnapshot.data;
  }

  // Only load facets + dietary + type centroids eagerly — goalMap + profiles
  // are lazy-loaded on first access since they're only needed for goal queries (~10%).
  const [catalogMeta, dietary_prevalence, typeCentroids, categoryTypeMap] = await Promise.all([
    loadFacets(),
    loadDietaryPrevalence(),
    loadTypeCentroids(),
    loadCategoryTypeMap(),
  ]);
  const snap: SearchIndexSnapshot = {
    index: [],
    profiles: [],
    goalMap: new Map(),
    catalogMeta,
    source: "pgvector",
    dietary_prevalence,
    typeCentroids,
    categoryTypeMap,
    _goalMapLoaded: false,
    _profilesLoaded: false,
  };
  cachedSnapshot = { data: snap, at: Date.now() };
  return snap;
}

export async function ensureGoalMap(snap: SearchIndexSnapshot): Promise<Map<string, GoalTraitMapRow>> {
  if (snap._goalMapLoaded) return snap.goalMap;
  snap.goalMap = await loadGoalMapFromDb();
  snap._goalMapLoaded = true;
  return snap.goalMap;
}

export async function ensureProfiles(snap: SearchIndexSnapshot): Promise<CategoryTraitProfileRow[]> {
  if (snap._profilesLoaded) return snap.profiles;
  const raw = await loadProfilesFromDb();
  snap.profiles = raw ?? [];
  snap._profilesLoaded = true;
  return snap.profiles;
}



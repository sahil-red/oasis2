import { getAiSearchProductPool } from "@/lib/products/queries";
import { adminClient } from "@/lib/supabase/admin";
import { buildIndexFromProducts } from "@/lib/search/v2/enrichment";
import { buildCategoryTraitProfiles } from "@/lib/search/v2/category-profiles";
import { embedText } from "@/lib/search/v2/embeddings";
import { SEED_GOAL_TRAIT_MAP } from "@/lib/search/v2/goal-graph";
import type {
  CategoryTraitProfileRow,
  GoalTraitMapRow,
  ProductSearchIndexRow,
} from "@/lib/search/v2/types";

export type SearchIndexSnapshot = {
  index: ProductSearchIndexRow[];
  profiles: CategoryTraitProfileRow[];
  goalMap: Map<string, GoalTraitMapRow>;
  source: "db" | "memory";
};

let cachedSnapshot: { data: SearchIndexSnapshot; at: number } | null = null;
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

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

function mapDbRow(raw: Record<string, unknown>): ProductSearchIndexRow {
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

  // Parallel — these run on the cold-snapshot request path; serial awaits would
  // stack seed-count × embedding latency (with retries) onto every cold query.
  const seedEmbeds = await Promise.all(
    SEED_GOAL_TRAIT_MAP.map((seed) => embedText(seed.goal_phrase, "document")),
  );
  SEED_GOAL_TRAIT_MAP.forEach((seed, i) => {
    const embed = seedEmbeds[i] ?? [];
    map.set(seed.goal_id, {
      ...seed,
      goal_embedding: embed.length ? embed : null,
    });
  });

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

async function loadIndexFromDb(): Promise<ProductSearchIndexRow[] | null> {
  try {
    const supabase = adminClient();
    const { data, error } = await supabase.from("product_search_index").select("*").limit(25000);
    if (error || !data?.length) return null;
    return data.map((row) => mapDbRow(row as Record<string, unknown>));
  } catch {
    return null;
  }
}

async function buildInMemorySnapshot(): Promise<SearchIndexSnapshot> {
  const products = await getAiSearchProductPool();
  const index = await buildIndexFromProducts(products, { useLlm: false });
  const profiles = await buildCategoryTraitProfiles(index);
  const goalMap = await loadGoalMapFromDb();
  return { index, profiles, goalMap, source: "memory" };
}

export function clearSearchIndexSnapshotCache(): void {
  cachedSnapshot = null;
}

export async function getSearchIndexSnapshot(forceRefresh = false): Promise<SearchIndexSnapshot> {
  if (!forceRefresh && cachedSnapshot && Date.now() - cachedSnapshot.at < SNAPSHOT_TTL_MS) {
    return cachedSnapshot.data;
  }

  if (process.env.SEARCH_EVAL_USE_MEMORY === "1") {
    const dbIndex = await loadIndexFromDb();
    if (dbIndex && dbIndex.length >= 100) {
      const dbProfiles = await loadProfilesFromDb();
      const goalMap = await loadGoalMapFromDb();
      const profiles =
        dbProfiles?.length ? dbProfiles : await buildCategoryTraitProfiles(dbIndex);
      const snap: SearchIndexSnapshot = { index: dbIndex, profiles, goalMap, source: "db" };
      cachedSnapshot = { data: snap, at: Date.now() };
      return snap;
    }
    const mem = await buildInMemorySnapshot();
    cachedSnapshot = { data: mem, at: Date.now() };
    return mem;
  }

  const [dbIndex, dbProfiles, goalMap] = await Promise.all([
    loadIndexFromDb(),
    loadProfilesFromDb(),
    loadGoalMapFromDb(),
  ]);

  if (dbIndex && dbIndex.length >= 100) {
    const profiles =
      dbProfiles?.length ? dbProfiles : await buildCategoryTraitProfiles(dbIndex);
    const snap: SearchIndexSnapshot = { index: dbIndex, profiles, goalMap, source: "db" };
    cachedSnapshot = { data: snap, at: Date.now() };
    return snap;
  }

  const mem = await buildInMemorySnapshot();
  cachedSnapshot = { data: mem, at: Date.now() };
  return mem;
}

export { isSearchV2Enabled } from "@/lib/search/v2/config";

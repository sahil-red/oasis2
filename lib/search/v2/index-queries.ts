import { getAiSearchProductPool } from "@/lib/products/queries";
import { adminClient } from "@/lib/supabase/admin";
import { buildIndexFromProducts } from "@/lib/search/v2/enrichment";
import { buildCategoryTraitProfiles } from "@/lib/search/v2/category-profiles";
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
    type_aliases: (raw.type_aliases as string[]) ?? [],
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
    sodium_mg: raw.sodium_mg != null ? Number(raw.sodium_mg) : null,
    energy_kcal: raw.energy_kcal != null ? Number(raw.energy_kcal) : null,
    price_inr: raw.price_inr != null ? Number(raw.price_inr) : null,
    sugar_tier: (raw.sugar_tier as ProductSearchIndexRow["sugar_tier"]) ?? null,
    protein_tier: (raw.protein_tier as ProductSearchIndexRow["protein_tier"]) ?? null,
    fat_tier: (raw.fat_tier as ProductSearchIndexRow["fat_tier"]) ?? null,
    traits: (raw.traits as ProductSearchIndexRow["traits"]) ?? {},
    trait_source: (raw.trait_source as ProductSearchIndexRow["trait_source"]) ?? {},
    trait_confidence: (raw.trait_confidence as ProductSearchIndexRow["trait_confidence"]) ?? {},
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
    search_count: Number(raw.search_count ?? 0),
    click_count: Number(raw.click_count ?? 0),
    save_count: Number(raw.save_count ?? 0),
  };
}

async function loadGoalMapFromDb(): Promise<Map<string, GoalTraitMapRow>> {
  const map = new Map<string, GoalTraitMapRow>();
  for (const g of SEED_GOAL_TRAIT_MAP) map.set(g.goal_id, g);

  try {
    const supabase = adminClient();
    const { data, error } = await supabase.from("goal_trait_map").select("*");
    if (error || !data?.length) return map;
    for (const row of data) {
      map.set(String(row.goal_id), {
        goal_id: String(row.goal_id),
        display_name: String(row.display_name),
        trait_weights: (row.trait_weights as GoalTraitMapRow["trait_weights"]) ?? {},
        source: String(row.source ?? "seed"),
        confidence: Number(row.confidence ?? 1),
      });
    }
  } catch {
    // table may not exist yet
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
  const index = buildIndexFromProducts(products);
  const profiles = buildCategoryTraitProfiles(index);
  const goalMap = await loadGoalMapFromDb();
  return { index, profiles, goalMap, source: "memory" };
}

export async function getSearchIndexSnapshot(forceRefresh = false): Promise<SearchIndexSnapshot> {
  if (!forceRefresh && cachedSnapshot && Date.now() - cachedSnapshot.at < SNAPSHOT_TTL_MS) {
    return cachedSnapshot.data;
  }

  const [dbIndex, dbProfiles, goalMap] = await Promise.all([
    loadIndexFromDb(),
    loadProfilesFromDb(),
    loadGoalMapFromDb(),
  ]);

  if (dbIndex && dbIndex.length >= 100) {
    const profiles = dbProfiles?.length ? dbProfiles : buildCategoryTraitProfiles(dbIndex);
    const snap: SearchIndexSnapshot = { index: dbIndex, profiles, goalMap, source: "db" };
    cachedSnapshot = { data: snap, at: Date.now() };
    return snap;
  }

  const mem = await buildInMemorySnapshot();
  cachedSnapshot = { data: mem, at: Date.now() };
  return mem;
}

export function isSearchV2Enabled(): boolean {
  return process.env.SEARCH_V2_ENABLED === "1" || process.env.SEARCH_V2_ENABLED === "true";
}

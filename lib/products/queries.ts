import type { DietMode } from "@/lib/diet/types";
import { computeGoalFit, goalFitInputs } from "@/lib/goals/fit";
import type { GoalId } from "@/lib/goals/types";
import {
  computeCatalogVisible,
  isCatalogSourceRow,
  isCatalogVisible,
} from "@/lib/products/catalog-eligibility";
import {
  filterCatalogProducts,
  type CatalogFilterState,
} from "@/lib/products/catalog-filter";
import {
  sortCatalogItems,
  sortFromParam,
  type CatalogSort,
} from "@/lib/products/catalog-sort";
import { adminClient } from "@/lib/supabase/admin";
import { requireSupabaseClient } from "@/lib/supabase/client";
import type { CoreScore, Grade, Product, ProductNutrition, ScoreBand } from "@/lib/supabase/types";

export { isCatalogSourceRow } from "@/lib/products/catalog-eligibility";

/** Server-side reads: service role when set, else anon (browser-safe) client. */
function db() {
  try {
    return adminClient();
  } catch {
    return requireSupabaseClient();
  }
}

/** Cached probe — prod may not have migration 0006 applied yet. */
let catalogVisibleColumn: boolean | undefined;

let cachedEligibleTotal: { count: number; at: number } | null = null;
const ELIGIBLE_COUNT_TTL_MS = 5 * 60 * 1000;

async function countEligibleCatalogProducts(
  state: CatalogFilterState,
  diet: DietMode,
): Promise<number> {
  if (
    cachedEligibleTotal &&
    Date.now() - cachedEligibleTotal.at < ELIGIBLE_COUNT_TTL_MS &&
    !state.q.trim() &&
    !state.category &&
    !state.subcategory &&
    !state.usecase &&
    !state.brand &&
    !state.minScore &&
    !state.grade &&
    !state.maxPrice &&
    diet === "any"
  ) {
    return cachedEligibleTotal.count;
  }

  const supabase = db();
  const sqlVisible = await catalogHasVisibleColumn();
  const batchSize = 1000;
  let dbOffset = 0;
  let total = 0;

  for (;;) {
    let q = applyScoreSortFilters(
      buildCatalogDbQuery(supabase, state, "full", sqlVisible),
      state,
    );
    const { data, error } = await q.range(dbOffset, dbOffset + batchSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (!rows.length) break;
    const batch = sqlVisible ? rows.map(mapListRow) : mapVisibleBatch(rows);
    total += filterCatalogProducts(batch, state, diet).length;
    if (rows.length < batchSize) break;
    dbOffset += rows.length;
    if (dbOffset >= 25_000) break;
  }

  if (
    !state.q.trim() &&
    !state.category &&
    !state.subcategory &&
    !state.usecase &&
    !state.brand &&
    !state.minScore &&
    !state.grade &&
    !state.maxPrice &&
    diet === "any"
  ) {
    cachedEligibleTotal = { count: total, at: Date.now() };
  }

  return total;
}

async function catalogHasVisibleColumn(): Promise<boolean> {
  if (catalogVisibleColumn !== undefined) return catalogVisibleColumn;
  const supabase = db();
  const { error } = await supabase.from("products").select("catalog_visible").limit(0);
  catalogVisibleColumn = !error;
  return catalogVisibleColumn;
}

const LIST_FIELDS =
  "id, slug, name, brand, super_category, category, subcategory, net_weight, attributes, price_inr, mrp_inr, image_urls, nutrition, ingredients_raw, zepto_sku, platform";

/** Grid list — omits heavy nutrition/ingredients when diet + goal fit are unused. */
const GRID_LIST_FIELDS =
  "id, slug, name, brand, super_category, category, subcategory, net_weight, price_inr, mrp_inr, image_urls, zepto_sku, platform";

const GOAL_LIST_FIELDS =
  "id, slug, name, brand, super_category, category, subcategory, net_weight, attributes, price_inr, mrp_inr, image_urls, nutrition, ingredients_raw, zepto_sku, platform";

/** Drop multi-KB attribute blobs from catalog JSON (Vercel cache limit is 2MB). */
const CATALOG_ATTR_KEYS = [
  "Diet Preference",
  "Food Preference",
  "Diet",
  "Type",
  "Key Features",
] as const;

function slimAttributesForCatalog(
  attrs: Record<string, string> | null,
): Record<string, string> | null {
  if (!attrs) return null;
  const out: Record<string, string> = {};
  for (const key of CATALOG_ATTR_KEYS) {
    const v = attrs[key];
    if (v?.trim()) out[key] = v.trim().slice(0, 240);
  }
  return Object.keys(out).length > 0 ? out : null;
}

function slimNutritionForCatalog(n: ProductNutrition | null): ProductNutrition | null {
  if (!n) return null;
  const slim: ProductNutrition = { source: n.source };
  if (n.energy_kcal_100g != null) slim.energy_kcal_100g = n.energy_kcal_100g;
  if (n.protein_g_100g != null) slim.protein_g_100g = n.protein_g_100g;
  if (n.carbs_g_100g != null) slim.carbs_g_100g = n.carbs_g_100g;
  if (n.fiber_g_100g != null) slim.fiber_g_100g = n.fiber_g_100g;
  if (n.sugar_g_100g != null) slim.sugar_g_100g = n.sugar_g_100g;
  if (n.added_sugar_g_100g != null) slim.added_sugar_g_100g = n.added_sugar_g_100g;
  if (n.fat_g_100g != null) slim.fat_g_100g = n.fat_g_100g;
  if (n.saturated_fat_g_100g != null) slim.saturated_fat_g_100g = n.saturated_fat_g_100g;
  if (n.sodium_mg_100g != null) slim.sodium_mg_100g = n.sodium_mg_100g;
  return slim;
}

function slimListItemForCatalog(row: ProductListItem): ProductListItem {
  return {
    ...row,
    attributes: slimAttributesForCatalog(row.attributes),
    ingredients_raw: row.ingredients_raw
      ? row.ingredients_raw.slice(0, 600)
      : null,
    nutrition: slimNutritionForCatalog(row.nutrition),
    image_urls: row.image_urls?.length ? [row.image_urls[0]] : [],
  };
}

/** Lighter join for grids — omits heavy subscores/concerns JSON. */
const LIST_SCORE_FIELDS = "score, grade, band";

export type ProductListItem = Pick<
  Product,
  | "id"
  | "slug"
  | "name"
  | "brand"
  | "super_category"
  | "category"
  | "subcategory"
  | "l3_category"
  | "net_weight"
  | "attributes"
  | "price_inr"
  | "mrp_inr"
  | "image_urls"
  | "nutrition"
  | "ingredients_raw"
> & {
  core_scores: Pick<
    CoreScore,
    "score" | "grade" | "band" | "subscores" | "concerns" | "computed_at"
  > | null;
};

export type ProductDetail = Product & {
  core_scores: CoreScore | null;
  platform?: string | null;
  data_source?: string | null;
  ocr_status?: string | null;
  ocr_payload?: Record<string, unknown> | null;
  ocr_image_url?: string | null;
};

export type CatalogFilters = {
  categories: string[];
  subcategories: string[];
  usecases: string[];
  brands: string[];
};

export type CatalogGridItem = Pick<
  ProductListItem,
  | "id"
  | "slug"
  | "name"
  | "brand"
  | "category"
  | "subcategory"
  | "net_weight"
  | "price_inr"
  | "mrp_inr"
  | "image_urls"
> & {
  core_scores: Pick<CoreScore, "score" | "grade" | "band"> | null;
};

export type CatalogSearchResult = {
  items: CatalogGridItem[];
  goalFits: Record<string, number>;
  page: number;
  limit: number;
  /** Products matching current filters (scored pool when unfiltered). */
  total: number;
  hasMore: boolean;
};

export type CatalogMeta = {
  stats: { visible: number; scored: number; zepto: number };
  filters: CatalogFilters;
};

function toGridItem(row: ProductListItem): CatalogGridItem {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    net_weight: row.net_weight,
    price_inr: row.price_inr,
    mrp_inr: row.mrp_inr,
    image_urls: row.image_urls?.length ? [row.image_urls[0]] : [],
    core_scores: row.core_scores
      ? {
          score: row.core_scores.score,
          grade: row.core_scores.grade,
          band: row.core_scores.band,
        }
      : null,
  };
}

function rowIsCatalogEligible(row: Record<string, unknown>): boolean {
  if (row.catalog_visible === true) return true;
  if (row.catalog_visible === false) return false;
  const mapped = mapListRow(row);
  return computeCatalogVisible({
    platform: row.platform as string,
    zepto_sku: row.zepto_sku as string | null,
    name: mapped.name,
    super_category: mapped.super_category,
    category: mapped.category,
    subcategory: mapped.subcategory,
    ingredients_raw: mapped.ingredients_raw,
    nutrition: mapped.nutrition,
  });
}

function mapVisibleBatch(rows: Record<string, unknown>[]): ProductListItem[] {
  return rows.filter(rowIsCatalogEligible).map((row) => mapListRow(row));
}

function mapListRow(row: Record<string, unknown>): ProductListItem {
  const scores = row.core_scores;
  const core =
    scores && typeof scores === "object" && !Array.isArray(scores)
      ? (scores as ProductListItem["core_scores"])
      : Array.isArray(scores) && scores[0]
        ? (scores[0] as ProductListItem["core_scores"])
        : null;

  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    brand: (row.brand as string | null) ?? null,
    super_category: (row.super_category as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    l3_category:
      (row.l3_category as string | null) ??
      ((row.attributes as Record<string, string> | null)?.["L3 Category"] ?? null),
    net_weight: (row.net_weight as string | null) ?? null,
    attributes: (row.attributes as Record<string, string> | null) ?? null,
    price_inr: row.price_inr != null ? Number(row.price_inr) : null,
    mrp_inr: row.mrp_inr != null ? Number(row.mrp_inr) : null,
    image_urls: (row.image_urls as string[]) ?? [],
    nutrition: (row.nutrition as ProductNutrition | null) ?? null,
    ingredients_raw: (row.ingredients_raw as string | null) ?? null,
    core_scores: core,
  };
}

type CatalogFilterRpc = {
  categories: string[];
  subcategories: string[];
  usecases: string[];
  brands: string[];
};

type CatalogStatsRpc = {
  visible: number;
  scored: number;
  zepto: number;
};

async function fetchCatalogFilterOptions(category?: string): Promise<CatalogFilters> {
  const supabase = db();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_catalog_filter_options", {
    p_category: category ?? null,
  });
  if (error) {
    return getCatalogFiltersFallback(category);
  }
  const row = data as CatalogFilterRpc | null;
  return {
    categories: row?.categories ?? [],
    subcategories: row?.subcategories ?? [],
    usecases: row?.usecases ?? [],
    brands: row?.brands ?? [],
  };
}

async function fetchCatalogStats(): Promise<CatalogStatsRpc> {
  const supabase = db();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_catalog_stats");
  if (error) {
    return countVisibleCatalogFallback();
  }
  const row = data as CatalogStatsRpc | null;
  return {
    visible: row?.visible ?? 0,
    scored: row?.scored ?? 0,
    zepto: row?.zepto ?? 0,
  };
}

/** Fallback when RPC migration is not applied yet. */
async function getCatalogFiltersFallback(category?: string): Promise<CatalogFilters> {
  const supabase = db();
  const pageSize = 2000;
  const all: Record<string, unknown>[] = [];

  for (let offset = 0; offset < 25_000; offset += pageSize) {
    let q = supabase
      .from("products")
      .select("category, subcategory, brand, attributes, l3_category")
      .eq("platform", "zepto")
      .not("category", "is", null)
      .range(offset, offset + pageSize - 1);

    if (category) q = q.eq("category", category);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }

  const categories = new Set<string>();
  const subcategories = new Set<string>();
  const usecases = new Set<string>();
  const brands = new Set<string>();

  for (const row of all) {
    const cat = row.category as string | null;
    const sub = row.subcategory as string | null;
    const brand = row.brand as string | null;
    const attrs = row.attributes as Record<string, string> | null;
    if (cat) categories.add(cat);
    if (!category || cat === category) {
      if (sub) subcategories.add(sub);
      const l3 =
        (row.l3_category as string | null) ??
        attrs?.["L3 Category"];
      if (l3?.trim()) usecases.add(l3.trim());
      if (brand) brands.add(brand);
    }
  }

  const sort = (a: string, b: string) => a.localeCompare(b);
  return {
    categories: [...categories].sort(sort),
    subcategories: [...subcategories].sort(sort),
    usecases: [...usecases].sort(sort),
    brands: [...brands].sort(sort),
  };
}

async function countVisibleCatalogFallback(): Promise<CatalogStatsRpc> {
  const supabase = db();

  const [zeptoRes, scoredRes, visibleRes] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("platform", "zepto"),
    supabase.from("core_scores").select("product_id", { count: "exact", head: true }),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("platform", "zepto")
      .not("nutrition", "is", null)
      .not("ingredients_raw", "is", null),
  ]);

  return {
    visible: visibleRes.count ?? 0,
    scored: scoredRes.count ?? 0,
    zepto: zeptoRes.count ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyDbSort(q: any, sort: CatalogSort): any {
  switch (sort) {
    case "score-asc":
      return q.order("score", {
        referencedTable: "core_scores",
        ascending: true,
        nullsFirst: false,
      });
    case "price-asc":
      return q.order("price_inr", { ascending: true, nullsFirst: false });
    case "price-desc":
      return q.order("price_inr", { ascending: false, nullsFirst: false });
    case "name-asc":
      return q.order("name", { ascending: true });
    case "protein-desc":
    case "score-desc":
    default:
      return q.order("score", {
        referencedTable: "core_scores",
        ascending: false,
        nullsFirst: false,
      });
  }
}

export async function getCatalogFilters(category?: string): Promise<CatalogFilters> {
  return fetchCatalogFilterOptions(category);
}

export async function countVisibleCatalog(): Promise<{
  visible: number;
  scored: number;
  zepto: number;
}> {
  return fetchCatalogStats();
}

export async function getCatalogMeta(category?: string): Promise<CatalogMeta> {
  const [stats, filters] = await Promise.all([
    countVisibleCatalog(),
    getCatalogFilters(category),
  ]);
  return { stats, filters };
}

function buildCatalogDbQuery(
  supabase: ReturnType<typeof db>,
  state: CatalogFilterState,
  variant: "grid" | "goal" | "full" = "grid",
  sqlVisible = true,
) {
  const fields =
    variant === "goal" ? GOAL_LIST_FIELDS : variant === "full" ? LIST_FIELDS : GRID_LIST_FIELDS;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("products")
    .select(`${fields}, core_scores (${LIST_SCORE_FIELDS})`)
    .eq("platform", "zepto");
  if (sqlVisible) q = q.eq("catalog_visible", true);

  if (state.onlyScored) q = q.not("core_scores", "is", null);
  if (state.minScore > 0) q = q.gte("core_scores.score", state.minScore);
  if (state.grade) q = q.eq("core_scores.grade", state.grade);
  if (state.brand) q = q.eq("brand", state.brand);
  if (state.category) q = q.eq("category", state.category);
  if (state.subcategory) q = q.eq("subcategory", state.subcategory);
  if (state.usecase) {
    q = q.filter("attributes->>L3 Category", "eq", state.usecase);
  }
  if (state.maxPrice > 0) {
    q = q.lte("price_inr", state.maxPrice);
  }
  if (state.q.trim()) {
    const term = state.q.trim().replace(/[%_]/g, "");
    if (term) q = q.or(`name.ilike.%${term}%,brand.ilike.%${term}%`);
  }
  return q;
}

function applyScoreSortFilters(
  q: ReturnType<typeof buildCatalogDbQuery>,
  state: CatalogFilterState,
) {
  if (state.sort === "score-desc" || state.sort === "score-asc") {
    return q.not("core_scores", "is", null);
  }
  return q;
}

function needsMemorySort(sort: CatalogSort): boolean {
  return sort === "protein-desc";
}

function isScoreSort(sort: CatalogSort): boolean {
  return sort === "score-desc" || sort === "score-asc";
}

function mapScoreSortedRow(row: Record<string, unknown>): ProductListItem {
  const raw = row.products;
  const p =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : Array.isArray(raw) && raw[0]
        ? (raw[0] as Record<string, unknown>)
        : null;
  if (!p) {
    throw new Error("mapScoreSortedRow: missing products embed");
  }
  return {
    id: p.id as string,
    slug: p.slug as string,
    name: p.name as string,
    brand: (p.brand as string | null) ?? null,
    super_category: (p.super_category as string | null) ?? null,
    category: (p.category as string | null) ?? null,
    subcategory: (p.subcategory as string | null) ?? null,
    l3_category: (p.l3_category as string | null) ?? null,
    net_weight: (p.net_weight as string | null) ?? null,
    attributes: null,
    price_inr: p.price_inr != null ? Number(p.price_inr) : null,
    mrp_inr: p.mrp_inr != null ? Number(p.mrp_inr) : null,
    image_urls: (p.image_urls as string[]) ?? [],
    nutrition: null,
    ingredients_raw: null,
    core_scores: {
      score: row.score as number,
      grade: row.grade as Grade,
      band: row.band as ScoreBand,
    },
  } as ProductListItem;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyScoreCatalogFilters(q: any, state: CatalogFilterState): any {
  if (state.grade) q = q.eq("grade", state.grade);
  if (state.minScore > 0) q = q.gte("score", state.minScore);
  if (state.brand) q = q.eq("products.brand", state.brand);
  if (state.category) q = q.eq("products.category", state.category);
  if (state.subcategory) q = q.eq("products.subcategory", state.subcategory);
  if (state.usecase) {
    q = q.filter("products.attributes->>L3 Category", "eq", state.usecase);
  }
  if (state.maxPrice > 0) q = q.lte("products.price_inr", state.maxPrice);
  if (state.q.trim()) {
    const term = state.q.trim().replace(/[%_]/g, "");
    if (term) {
      q = q.or(`name.ilike.%${term}%,brand.ilike.%${term}%`, { referencedTable: "products" });
    }
  }
  return q;
}

function buildScoreSortedCatalogQuery(
  supabase: ReturnType<typeof db>,
  state: CatalogFilterState,
  ascending: boolean,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("core_scores")
    .select(`score, grade, band, products!inner(${GRID_LIST_FIELDS}, catalog_visible)`)
    .eq("products.platform", "zepto")
    .eq("products.catalog_visible", true);
  q = applyScoreCatalogFilters(q, state);
  return q.order("score", { ascending, nullsFirst: false });
}

async function countScoreSortedCatalogMatches(
  supabase: ReturnType<typeof db>,
  state: CatalogFilterState,
): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("core_scores")
    .select("score, products!inner(id)", { count: "exact", head: true })
    .eq("products.platform", "zepto")
    .eq("products.catalog_visible", true);
  q = applyScoreCatalogFilters(q, state);
  const { count, error } = await q;
  if (error) throw new Error(error.message || "countScoreSortedCatalogMatches failed");
  return count ?? 0;
}

async function paginateCatalogByScoreSql(opts: {
  page: number;
  limit: number;
  state: CatalogFilterState;
}): Promise<{ items: ProductListItem[]; total: number; hasMore: boolean }> {
  const { page, limit, state } = opts;
  const ascending = state.sort === "score-asc";
  const start = (page - 1) * limit;
  const supabase = db();
  const q = buildScoreSortedCatalogQuery(supabase, state, ascending);

  const [{ data, error }, total] = await Promise.all([
    q.range(start, start + limit - 1),
    countScoreSortedCatalogMatches(supabase, state),
  ]);

  if (error) throw new Error(error.message);
  const items = ((data ?? []) as Record<string, unknown>[]).map(mapScoreSortedRow);

  return {
    items,
    total,
    hasMore: start + items.length < total,
  };
}

function countNeedsScoreJoin(state: CatalogFilterState): boolean {
  return (
    state.onlyScored ||
    state.minScore > 0 ||
    Boolean(state.grade) ||
    state.sort === "score-desc" ||
    state.sort === "score-asc"
  );
}

async function countCatalogMatches(
  supabase: ReturnType<typeof db>,
  state: CatalogFilterState,
  sqlVisible = true,
): Promise<number> {
  const scoreJoin = countNeedsScoreJoin(state);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase as any)
    .from("products")
    .select(scoreJoin ? "id, core_scores!inner(score)" : "id", {
      count: "exact",
      head: true,
    })
    .eq("platform", "zepto");
  if (sqlVisible) q = q.eq("catalog_visible", true);

  if (!scoreJoin && state.onlyScored) q = q.not("core_scores", "is", null);
  if (state.minScore > 0) q = q.gte("core_scores.score", state.minScore);
  if (state.grade) q = q.eq("core_scores.grade", state.grade);
  if (state.brand) q = q.eq("brand", state.brand);
  if (state.category) q = q.eq("category", state.category);
  if (state.subcategory) q = q.eq("subcategory", state.subcategory);
  if (state.usecase) {
    q = q.filter("attributes->>L3 Category", "eq", state.usecase);
  }
  if (state.maxPrice > 0) q = q.lte("price_inr", state.maxPrice);
  if (state.q.trim()) {
    const term = state.q.trim().replace(/[%_]/g, "");
    if (term) q = q.or(`name.ilike.%${term}%,brand.ilike.%${term}%`);
  }
  if (!scoreJoin && (state.sort === "score-desc" || state.sort === "score-asc")) {
    q = q.not("core_scores", "is", null);
  }

  const { count, error } = await q;
  if (error) throw new Error(error.message || "countCatalogMatches failed");
  return count ?? 0;
}

async function paginateCatalogSql(opts: {
  page: number;
  limit: number;
  state: CatalogFilterState;
  diet: DietMode;
  variant?: "grid" | "goal" | "full";
}): Promise<{ items: ProductListItem[]; total: number; hasMore: boolean }> {
  const { page, limit, state, diet, variant = "grid" } = opts;
  const sqlVisible = await catalogHasVisibleColumn();

  if (diet !== "any" || !sqlVisible) {
    return paginateCatalogWithClientFilter({
      page,
      limit,
      state,
      diet,
      variant: sqlVisible ? variant : "full",
    });
  }

  if (isScoreSort(state.sort)) {
    return paginateCatalogByScoreSql({ page, limit, state });
  }

  const start = (page - 1) * limit;
  const supabase = db();
  let q = applyScoreSortFilters(buildCatalogDbQuery(supabase, state, variant, true), state);
  q = applyDbSort(q, state.sort);

  const [{ data, error }, total] = await Promise.all([
    q.range(start, start + limit - 1),
    countCatalogMatches(supabase, state, true),
  ]);

  if (error) throw new Error(error.message);
  const items = ((data ?? []) as unknown as Record<string, unknown>[]).map(mapListRow);

  return {
    items,
    total,
    hasMore: start + items.length < total,
  };
}

async function paginateCatalogWithClientFilter(opts: {
  page: number;
  limit: number;
  state: CatalogFilterState;
  diet: DietMode;
  variant?: "grid" | "goal" | "full";
}): Promise<{ items: ProductListItem[]; total: number; hasMore: boolean }> {
  const { page, limit, state, diet, variant = "full" } = opts;
  const start = (page - 1) * limit;
  const target = start + limit;
  const supabase = db();
  const batchSize = 500;
  const matched: ProductListItem[] = [];
  let dbOffset = 0;
  let dbExhausted = false;
  const sqlVisible = await catalogHasVisibleColumn();

  while (matched.length < target && !dbExhausted && dbOffset < 25_000) {
    let q = applyScoreSortFilters(
      buildCatalogDbQuery(supabase, state, variant, sqlVisible),
      state,
    );
    q = applyDbSort(q, state.sort);
    const { data, error } = await q.range(dbOffset, dbOffset + batchSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    if (rows.length < batchSize) dbExhausted = true;
    dbOffset += rows.length;

    const batch = sqlVisible ? rows.map(mapListRow) : mapVisibleBatch(rows);
    matched.push(...filterCatalogProducts(batch, state, diet));
  }

  const sorted = sortCatalogItems(matched, state.sort);
  const items = sorted.slice(start, start + limit);
  const total = dbExhausted
    ? sorted.length
    : page === 1
      ? await countEligibleCatalogProducts(state, diet)
      : (cachedEligibleTotal?.count ?? Math.max(sorted.length, start + limit));

  return {
    items,
    total,
    hasMore: dbExhausted ? start + limit < sorted.length : items.length === limit,
  };
}

async function paginateGoalCatalog(opts: {
  page: number;
  limit: number;
  state: CatalogFilterState;
  diet: DietMode;
  goal: GoalId;
}): Promise<CatalogSearchResult> {
  const { page, limit, state, diet, goal } = opts;
  const supabase = db();
  const poolSize = 5000;
  const pageSize = 1000;
  const pool: ProductListItem[] = [];
  const sqlVisible = await catalogHasVisibleColumn();

  for (let offset = 0; offset < poolSize; offset += pageSize) {
    let q = applyScoreSortFilters(
      buildCatalogDbQuery(supabase, state, "goal", sqlVisible),
      state,
    );
    q = applyDbSort(q, "score-desc").not("core_scores", "is", null);
    const { data, error } = await q.range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const batch = sqlVisible ? rows.map(mapListRow) : mapVisibleBatch(rows);
    pool.push(...filterCatalogProducts(batch, state, diet));
    if (rows.length < pageSize) break;
  }

  const ranked = pool
    .map((p) => ({ p, fit: computeGoalFit(goal, goalFitInputs(p)).fit }))
    .sort((a, b) => b.fit - a.fit);
  const goalFits = Object.fromEntries(ranked.map(({ p, fit }) => [p.id, fit]));
  const sorted = ranked.map((x) => x.p);
  const total = sorted.length;
  const start = (page - 1) * limit;
  const items = sorted.slice(start, start + limit).map(toGridItem);

  return {
    items,
    goalFits: Object.fromEntries(items.map((i) => [i.id, goalFits[i.id] ?? 0])),
    page,
    limit,
    total,
    hasMore: start + limit < total,
  };
}

async function fetchProteinSortedCatalog(
  state: CatalogFilterState,
  diet: DietMode,
  maxRows = 8000,
): Promise<ProductListItem[]> {
  const supabase = db();
  const pageSize = 1000;
  const all: ProductListItem[] = [];
  const sqlVisible = await catalogHasVisibleColumn();

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    let q = applyScoreSortFilters(
      buildCatalogDbQuery(supabase, state, "full", sqlVisible),
      state,
    );
    const { data, error } = await q.range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const batch = sqlVisible ? rows.map(mapListRow) : mapVisibleBatch(rows);
    all.push(...filterCatalogProducts(batch, state, diet));
    if (rows.length < pageSize) break;
  }

  return sortCatalogItems(all, state.sort);
}

function parseSearchState(opts: {
  q?: string;
  category?: string;
  subcategory?: string;
  usecase?: string;
  brand?: string;
  onlyScored?: boolean;
  minScore?: number;
  maxPrice?: number;
  grade?: Grade | "";
  sort?: CatalogSort;
}): CatalogFilterState {
  return {
    q: opts.q?.trim() ?? "",
    category: opts.category ?? "",
    subcategory: opts.subcategory ?? "",
    usecase: opts.usecase ?? "",
    brand: opts.brand ?? "",
    onlyScored: opts.onlyScored ?? false,
    minScore: opts.minScore ?? 0,
    maxPrice: opts.maxPrice ?? 0,
    grade: opts.grade ?? "",
    sort: opts.sort ?? "score-desc",
  };
}

export async function searchCatalogGrid(opts: {
  q?: string;
  category?: string;
  subcategory?: string;
  usecase?: string;
  brand?: string;
  page?: number;
  limit?: number;
  onlyScored?: boolean;
  minScore?: number;
  maxPrice?: number;
  grade?: Grade | "";
  sort?: CatalogSort;
  goal?: GoalId;
  diet?: DietMode;
}): Promise<CatalogSearchResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(120, Math.max(1, opts.limit ?? 96));
  const goal = opts.goal ?? "balanced";
  const diet = opts.diet ?? "any";
  const state = parseSearchState(opts);

  if (goal !== "balanced") {
    return paginateGoalCatalog({ page, limit, state, diet, goal });
  }

  if (needsMemorySort(state.sort)) {
    const pool = await fetchProteinSortedCatalog(state, diet);
    const total = pool.length;
    const start = (page - 1) * limit;
    const items = pool.slice(start, start + limit).map(toGridItem);
    return {
      items,
      goalFits: {},
      page,
      limit,
      total,
      hasMore: start + limit < total,
    };
  }

  const paged = await paginateCatalogSql({ page, limit, state, diet });
  return {
    items: paged.items.map(toGridItem),
    goalFits: {},
    page,
    limit,
    total: paged.total,
    hasMore: paged.hasMore,
  };
}

/** Scored visible products for insights — server-side only, slim fields. */
export async function getScoredProductsForInsights(): Promise<ProductListItem[]> {
  const supabase = db();
  const pageSize = 1000;
  const max = 30_000;
  const all: ProductListItem[] = [];
  const sqlVisible = await catalogHasVisibleColumn();

  for (let offset = 0; offset < max; offset += pageSize) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("products")
      .select(`${LIST_FIELDS}, core_scores (${LIST_SCORE_FIELDS})`)
      .eq("platform", "zepto")
      .not("core_scores", "is", null)
      .order("name", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (sqlVisible) q = q.eq("catalog_visible", true);

    const { data, error } = await q;

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    all.push(...mapVisibleBatch(rows));
    if (rows.length < pageSize) break;
  }

  return all.map(slimListItemForCatalog);
}

export async function searchProducts(opts: {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  limit?: number;
  onlyScored?: boolean;
  onlyWithDetail?: boolean;
}): Promise<ProductListItem[]> {
  const supabase = db();
  const limit = opts.limit ?? 120;

  let query = supabase
    .from("products")
    .select(`${LIST_FIELDS}, core_scores (${LIST_SCORE_FIELDS})`)
    .order("name", { ascending: true })
    .limit(limit);

  if (opts.onlyWithDetail) {
    query = query.eq("platform", "zepto");
  }

  if (opts.q?.trim()) {
    query = query.ilike("name", `%${opts.q.trim()}%`);
  }
  if (opts.category) query = query.eq("category", opts.category);
  if (opts.subcategory) query = query.eq("subcategory", opts.subcategory);
  if (opts.brand) query = query.eq("brand", opts.brand);

  if (opts.onlyScored) {
    query = query.not("core_scores", "is", null);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const items = (data ?? [])
    .filter((row) => {
      const r = row as Record<string, unknown>;
      const mapped = mapListRow(r);
      return (
        isCatalogVisible(mapped) &&
        isCatalogSourceRow({
          platform: r.platform as string,
          zepto_sku: r.zepto_sku as string | null,
        })
      );
    })
    .map((row) => mapListRow(row as Record<string, unknown>));
  items.sort((a, b) => (b.core_scores?.score ?? -1) - (a.core_scores?.score ?? -1));
  return items;
}

/** Full catalog for client-side instant filtering (search page). */
export async function getAllCatalogProducts(opts?: {
  onlyWithDetail?: boolean;
  onlyScored?: boolean;
}): Promise<ProductListItem[]> {
  const supabase = db();
  const pageSize = 1000;
  const max = 30_000;
  const all: ProductListItem[] = [];

  for (let offset = 0; offset < max; offset += pageSize) {
    let query = supabase
      .from("products")
      .select(`${LIST_FIELDS}, core_scores (${LIST_SCORE_FIELDS})`)
      .order("name", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (opts?.onlyWithDetail ?? true) {
      query = query.eq("platform", "zepto");
    }
    if (opts?.onlyScored) {
      query = query.not("core_scores", "is", null);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const batch = rows
      .filter((row) => {
        const r = row as Record<string, unknown>;
        const mapped = mapListRow(r);
        return (
          isCatalogVisible(mapped) &&
          isCatalogSourceRow({
            platform: r.platform as string,
            zepto_sku: r.zepto_sku as string | null,
          })
        );
      })
      .map((row) => mapListRow(row as Record<string, unknown>));
    all.push(...batch);
    if (rows.length < pageSize) break;
  }

  all.sort((a, b) => (b.core_scores?.score ?? -1) - (a.core_scores?.score ?? -1));
  return all.map(slimListItemForCatalog);
}

/** Same-aisle pool for PDP swaps — avoids loading the full catalog. */
export async function getProductsForSwaps(
  current: Pick<ProductListItem, "id" | "category" | "super_category">,
  limit = 200,
): Promise<ProductListItem[]> {
  const supabase = db();
  const aisle = current.category ?? current.super_category;
  let query = supabase
    .from("products")
    .select(`${LIST_FIELDS}, core_scores (${LIST_SCORE_FIELDS})`)
    .eq("platform", "zepto")
    .not("core_scores", "is", null)
    .neq("id", current.id)
    .limit(limit);

  if (aisle) query = query.eq("category", aisle);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => mapListRow(row as Record<string, unknown>))
    .filter(isCatalogVisible);
}

export async function getProductsBySlugs(slugs: string[]): Promise<ProductListItem[]> {
  if (!slugs.length) return [];
  const supabase = db();
  const { data, error } = await supabase
    .from("products")
    .select(`${LIST_FIELDS}, core_scores (${LIST_SCORE_FIELDS})`)
    .in("slug", slugs);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => mapListRow(row as Record<string, unknown>))
    .filter(isCatalogVisible);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const supabase = db();

  const { data, error } = await supabase
    .from("products")
    .select(
      `
      id, zepto_sku, slug, name, brand, super_category, category, subcategory,
      net_weight, price_inr, mrp_inr, image_urls, product_url, barcode,
      ingredients_raw, nutrition, attributes, raw_payload, scraped_at, updated_at,
      platform, ocr_status, ocr_payload, ocr_image_url,
      core_scores (product_id, score, grade, band, subscores, concerns, breakdown, rule_version, computed_at)
    `,
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const scores = row.core_scores;
  let core: CoreScore | null = null;
  if (scores && typeof scores === "object") {
    const s = Array.isArray(scores) ? scores[0] : scores;
    if (s && typeof s === "object") core = s as CoreScore;
  }

  return {
    id: row.id as string,
    zepto_sku: row.zepto_sku as string,
    slug: row.slug as string,
    name: row.name as string,
    brand: (row.brand as string | null) ?? null,
    super_category: (row.super_category as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    l3_category:
      (row.l3_category as string | null) ??
      ((row.attributes as Record<string, string> | null)?.["L3 Category"] ?? null),
    net_weight: (row.net_weight as string | null) ?? null,
    price_inr: row.price_inr != null ? Number(row.price_inr) : null,
    mrp_inr: row.mrp_inr != null ? Number(row.mrp_inr) : null,
    image_urls: (row.image_urls as string[]) ?? [],
    product_url: (row.product_url as string | null) ?? null,
    barcode: (row.barcode as string | null) ?? null,
    ingredients_raw: (row.ingredients_raw as string | null) ?? null,
    nutrition: (row.nutrition as ProductNutrition | null) ?? null,
    attributes: (row.attributes as Record<string, string> | null) ?? null,
    raw_payload: (row.raw_payload as Record<string, unknown> | null) ?? null,
    scraped_at: row.scraped_at as string,
    updated_at: row.updated_at as string,
    platform: (row.platform as string | null) ?? null,
    data_source: row.platform === "zepto" ? "csv" : "scrape",
    ocr_status: (row.ocr_status as string | null) ?? null,
    ocr_payload: (row.ocr_payload as Record<string, unknown> | null) ?? null,
    ocr_image_url: (row.ocr_image_url as string | null) ?? null,
    core_scores: core,
  };
}

/** Real product for homepage hero — prefer a scored snack with nutrition. */
export async function getFeaturedSample(): Promise<ProductListItem | null> {
  const items = await searchProducts({ onlyScored: true, onlyWithDetail: true, limit: 80 });
  const pick =
    items.find(
      (p) =>
        p.nutrition &&
        p.core_scores &&
        p.core_scores.score >= 35 &&
        p.core_scores.score <= 55 &&
        /noodle|chips|chocolate|cola|biscuit/i.test(p.name),
    ) ?? items.find((p) => p.core_scores && p.nutrition) ?? items[0];
  return pick ?? null;
}

export async function countCatalog(): Promise<{
  total: number;
  scored: number;
  withDetail: number;
}> {
  const supabase = db();

  const [totalRes, detailRes, scoredRes] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("platform", "zepto"),
    supabase.from("core_scores").select("product_id", { count: "exact", head: true }),
  ]);

  return {
    total: totalRes.count ?? 0,
    withDetail: detailRes.count ?? 0,
    scored: scoredRes.count ?? 0,
  };
}

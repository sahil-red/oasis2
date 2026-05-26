import { isBlockedTaxonomy } from "@/lib/catalog/policy";
import type { DietMode } from "@/lib/diet/types";
import { computeGoalFit, goalFitInputs } from "@/lib/goals/fit";
import type { GoalId } from "@/lib/goals/types";
import { adminClient } from "@/lib/supabase/admin";
import { requireSupabaseClient } from "@/lib/supabase/client";
import { isPlatformNutritionComplete } from "@/lib/nutrition/completeness";
import type { CoreScore, Product, ProductNutrition } from "@/lib/supabase/types";

import { isZeptoVariantId } from "@/lib/zepto-import/variant-id";
import {
  filterCatalogProducts,
  type CatalogFilterState,
} from "@/lib/products/catalog-filter";
import { productAisle, productShelf, productUsecase } from "@/lib/products/catalog-meta";

/** Rows eligible for public catalog (CSV import with real variant UUID). */
export function isCatalogSourceRow(p: {
  platform?: string | null;
  zepto_sku?: string | null;
}): boolean {
  return p.platform === "zepto" && isZeptoVariantId(p.zepto_sku);
}

/** Food SKUs with label-grade nutrition — excludes non-food and Zepto rows pending nutrition. */
function isCatalogVisible(p: {
  name: string;
  super_category: string | null;
  category: string | null;
  subcategory: string | null;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
}): boolean {
  if (
    isBlockedTaxonomy({
      super_category: p.super_category,
      category: p.category,
      subcategory: p.subcategory,
      name: p.name,
    })
  ) {
    return false;
  }
  return isPlatformNutritionComplete(p.ingredients_raw, p.nutrition);
}

/** Server-side reads: service role when set, else anon (browser-safe) client. */
function db() {
  try {
    return adminClient();
  } catch {
    return requireSupabaseClient();
  }
}

const LIST_FIELDS =
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
  const mapped = mapListRow(row);
  return (
    isCatalogVisible(mapped) &&
    isCatalogSourceRow({
      platform: row.platform as string,
      zepto_sku: row.zepto_sku as string | null,
    })
  );
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

const FILTER_SCAN_FIELDS =
  "name, super_category, category, subcategory, brand, ingredients_raw, nutrition, attributes, platform, zepto_sku, core_scores (score, grade, band)";

async function scanVisibleZeptoRows(
  opts?: { category?: string },
): Promise<Record<string, unknown>[]> {
  const supabase = db();
  const pageSize = 1000;
  const max = 30_000;
  const all: Record<string, unknown>[] = [];

  for (let offset = 0; offset < max; offset += pageSize) {
    let q = supabase
      .from("products")
      .select(FILTER_SCAN_FIELDS)
      .eq("platform", "zepto")
      .order("name", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (opts?.category) q = q.eq("category", opts.category);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const row of rows) {
      if (rowIsCatalogEligible(row)) all.push(row);
    }
    if (rows.length < pageSize) break;
  }

  return all;
}

export async function getCatalogFilters(category?: string): Promise<CatalogFilters> {
  const rows = await scanVisibleZeptoRows({ category });
  const categories = new Set<string>();
  const subcategories = new Set<string>();
  const usecases = new Set<string>();
  const brands = new Set<string>();

  for (const row of rows) {
    const mapped = mapListRow(row);
    const aisle = productAisle(mapped);
    if (aisle) categories.add(aisle);
    if (!category || aisle === category) {
      const shelf = productShelf(mapped);
      if (shelf) subcategories.add(shelf);
      const usecase = productUsecase(mapped);
      if (usecase) usecases.add(usecase);
      if (mapped.brand) brands.add(mapped.brand);
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

export async function countVisibleCatalog(): Promise<{
  visible: number;
  scored: number;
  zepto: number;
}> {
  const supabase = db();
  const zeptoRes = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("platform", "zepto");

  const rows = await scanVisibleZeptoRows();
  const scored = rows.filter((row) => {
    const mapped = mapListRow(row);
    return Boolean(mapped.core_scores);
  }).length;

  return {
    visible: rows.length,
    scored,
    zepto: zeptoRes.count ?? 0,
  };
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
  opts: {
    q?: string;
    category?: string;
    subcategory?: string;
    usecase?: string;
    brand?: string;
    onlyScored?: boolean;
  },
) {
  let q = supabase
    .from("products")
    .select(`${LIST_FIELDS}, core_scores (${LIST_SCORE_FIELDS})`)
    .eq("platform", "zepto");

  if (opts.onlyScored) q = q.not("core_scores", "is", null);
  if (opts.brand) q = q.eq("brand", opts.brand);
  if (opts.category) q = q.eq("category", opts.category);
  if (opts.subcategory) q = q.eq("subcategory", opts.subcategory);
  if (opts.usecase) {
    q = q.filter("attributes->>L3 Category", "eq", opts.usecase);
  }
  if (opts.q?.trim()) {
    const term = opts.q.trim().replace(/[%_]/g, "");
    if (term) q = q.or(`name.ilike.%${term}%,brand.ilike.%${term}%`);
  }
  return q;
}

async function fetchFilteredCatalog(
  state: CatalogFilterState,
  diet: DietMode,
  opts?: { maxRows?: number; orderByScore?: boolean },
): Promise<ProductListItem[]> {
  const supabase = db();
  const pageSize = 1000;
  const max = opts?.maxRows ?? 30_000;
  const all: ProductListItem[] = [];

  for (let offset = 0; offset < max; offset += pageSize) {
    let q = buildCatalogDbQuery(supabase, {
      q: state.q,
      category: state.category || undefined,
      subcategory: state.subcategory || undefined,
      usecase: state.usecase || undefined,
      brand: state.brand || undefined,
      onlyScored: state.onlyScored,
    });
    if (opts?.orderByScore) {
      q = q.order("score", {
        referencedTable: "core_scores",
        ascending: false,
        nullsFirst: false,
      });
    } else {
      q = q.order("name", { ascending: true });
    }
    const { data, error } = await q.range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    const batch = mapVisibleBatch(rows);
    all.push(...filterCatalogProducts(batch, state, diet));
    if (rows.length < pageSize) break;
  }

  return all;
}

function hasHeavyFilters(state: CatalogFilterState, diet: DietMode): boolean {
  return Boolean(
    state.q.trim() ||
      state.subcategory ||
      state.usecase ||
      state.brand ||
      state.onlyScored ||
      diet !== "any",
  );
}

async function countFilteredVisibleCatalog(
  state: CatalogFilterState,
  diet: DietMode,
): Promise<number> {
  const rows = await scanVisibleZeptoRows({
    category: state.category || undefined,
  });
  return filterCatalogProducts(mapVisibleBatch(rows), state, diet).length;
}

async function paginateBalancedCatalog(opts: {
  page: number;
  limit: number;
  state: CatalogFilterState;
  diet: DietMode;
}): Promise<{ items: ProductListItem[]; total: number; hasMore: boolean }> {
  const { page, limit, state, diet } = opts;
  const start = (page - 1) * limit;
  const need = start + limit;
  const supabase = db();
  const batchSize = 400;
  const visible: ProductListItem[] = [];
  let dbOffset = 0;
  let dbExhausted = false;

  while (visible.length < need && !dbExhausted) {
    let q = buildCatalogDbQuery(supabase, {
      q: state.q,
      category: state.category || undefined,
      subcategory: state.subcategory || undefined,
      usecase: state.usecase || undefined,
      brand: state.brand || undefined,
      onlyScored: state.onlyScored,
    })
      .order("score", {
        referencedTable: "core_scores",
        ascending: false,
        nullsFirst: false,
      })
      .range(dbOffset, dbOffset + batchSize - 1);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length < batchSize) dbExhausted = true;
    dbOffset += batchSize;

    visible.push(...filterCatalogProducts(mapVisibleBatch(rows), state, diet));
  }

  visible.sort(
    (a, b) => (b.core_scores?.score ?? -1) - (a.core_scores?.score ?? -1),
  );
  const items = visible.slice(start, start + limit);
  return {
    items,
    total: dbExhausted ? visible.length : Math.max(visible.length, start + limit + 1),
    hasMore: dbExhausted ? start + limit < visible.length : items.length === limit,
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
  goal?: GoalId;
  diet?: DietMode;
}): Promise<CatalogSearchResult> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(120, Math.max(1, opts.limit ?? 96));
  const goal = opts.goal ?? "balanced";
  const diet = opts.diet ?? "any";
  const state: CatalogFilterState = {
    q: opts.q?.trim() ?? "",
    category: opts.category ?? "",
    subcategory: opts.subcategory ?? "",
    usecase: opts.usecase ?? "",
    brand: opts.brand ?? "",
    onlyScored: opts.onlyScored ?? false,
  };

  const goalSort = goal !== "balanced";
  const heavy = hasHeavyFilters(state, diet);

  if (!goalSort && !heavy) {
    const paged = await paginateBalancedCatalog({ page, limit, state, diet });
    let total = paged.total;
    if (page === 1 && paged.hasMore) {
      total = await countFilteredVisibleCatalog(state, diet);
    }
    return {
      items: paged.items.map(toGridItem),
      goalFits: {},
      page,
      limit,
      total,
      hasMore: paged.hasMore,
    };
  }

  const pool = await fetchFilteredCatalog(state, diet, {
    maxRows: goalSort ? 8000 : 30_000,
    orderByScore: !goalSort,
  });

  let goalFits: Record<string, number> = {};
  let sorted: ProductListItem[];

  if (goalSort) {
    const ranked = pool
      .map((p) => ({ p, fit: computeGoalFit(goal, goalFitInputs(p)).fit }))
      .sort((a, b) => b.fit - a.fit);
    goalFits = Object.fromEntries(ranked.map(({ p, fit }) => [p.id, fit]));
    sorted = ranked.map((x) => x.p);
  } else {
    sorted = [...pool].sort(
      (a, b) => (b.core_scores?.score ?? -1) - (a.core_scores?.score ?? -1),
    );
  }

  const total = sorted.length;
  const start = (page - 1) * limit;
  const items = sorted.slice(start, start + limit).map(toGridItem);

  return {
    items,
    goalFits: goalSort
      ? Object.fromEntries(items.map((i) => [i.id, goalFits[i.id] ?? 0]))
      : {},
    page,
    limit,
    total,
    hasMore: start + limit < total,
  };
}

/** Scored visible products for insights — server-side only, slim fields. */
export async function getScoredProductsForInsights(): Promise<ProductListItem[]> {
  const supabase = db();
  const pageSize = 1000;
  const max = 30_000;
  const all: ProductListItem[] = [];

  for (let offset = 0; offset < max; offset += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select(`${LIST_FIELDS}, core_scores (${LIST_SCORE_FIELDS})`)
      .eq("platform", "zepto")
      .not("core_scores", "is", null)
      .order("name", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
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

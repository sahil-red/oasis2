import { adminClient } from "@/lib/supabase/admin";
import { requireSupabaseClient } from "@/lib/supabase/client";
import type { CoreScore, Product, ProductNutrition } from "@/lib/supabase/types";

/** Server-side reads: service role when set, else anon (browser-safe) client. */
function db() {
  try {
    return adminClient();
  } catch {
    return requireSupabaseClient();
  }
}

const LIST_FIELDS =
  "id, slug, name, brand, category, subcategory, price_inr, mrp_inr, image_urls, nutrition, ingredients_raw";

export type ProductListItem = Pick<
  Product,
  | "id"
  | "slug"
  | "name"
  | "brand"
  | "category"
  | "subcategory"
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
};

export type CatalogFilters = {
  categories: string[];
  subcategories: string[];
  brands: string[];
};

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
    category: (row.category as string | null) ?? null,
    subcategory: (row.subcategory as string | null) ?? null,
    price_inr: row.price_inr != null ? Number(row.price_inr) : null,
    mrp_inr: row.mrp_inr != null ? Number(row.mrp_inr) : null,
    image_urls: (row.image_urls as string[]) ?? [],
    nutrition: (row.nutrition as ProductNutrition | null) ?? null,
    ingredients_raw: (row.ingredients_raw as string | null) ?? null,
    core_scores: core,
  };
}

export async function getCatalogFilters(category?: string): Promise<CatalogFilters> {
  const supabase = db();
  let q = supabase
    .from("products")
    .select("category, subcategory, brand")
    .not("raw_payload", "is", null);

  if (category) q = q.eq("category", category);

  const { data, error } = await q.limit(2000);
  if (error) throw new Error(error.message);

  const categories = new Set<string>();
  const subcategories = new Set<string>();
  const brands = new Set<string>();

  for (const row of data ?? []) {
    if (row.category) categories.add(row.category as string);
    if (row.subcategory) subcategories.add(row.subcategory as string);
    if (row.brand) brands.add(row.brand as string);
  }

  const sort = (a: string, b: string) => a.localeCompare(b);
  return {
    categories: [...categories].sort(sort),
    subcategories: [...subcategories].sort(sort),
    brands: [...brands].sort(sort),
  };
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
    .select(`${LIST_FIELDS}, core_scores (score, grade, band, subscores, concerns, computed_at)`)
    .order("name", { ascending: true })
    .limit(limit);

  if (opts.onlyWithDetail) {
    query = query.not("raw_payload", "is", null);
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
  const items = (data ?? []).map((row) => mapListRow(row as Record<string, unknown>));
  items.sort((a, b) => (b.core_scores?.score ?? -1) - (a.core_scores?.score ?? -1));
  return items;
}

/** Full catalog for client-side instant filtering (search page). */
export async function getAllCatalogProducts(opts?: {
  onlyWithDetail?: boolean;
  onlyScored?: boolean;
}): Promise<ProductListItem[]> {
  return searchProducts({
    onlyWithDetail: opts?.onlyWithDetail ?? true,
    onlyScored: opts?.onlyScored,
    limit: 500,
  });
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const supabase = db();

  const { data, error } = await supabase
    .from("products")
    .select(
      `
      id, zepto_sku, slug, name, brand, super_category, category, subcategory,
      net_weight, price_inr, mrp_inr, image_urls, product_url, barcode,
      ingredients_raw, nutrition, attributes, scraped_at, updated_at,
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
    net_weight: (row.net_weight as string | null) ?? null,
    price_inr: row.price_inr != null ? Number(row.price_inr) : null,
    mrp_inr: row.mrp_inr != null ? Number(row.mrp_inr) : null,
    image_urls: (row.image_urls as string[]) ?? [],
    product_url: (row.product_url as string | null) ?? null,
    barcode: (row.barcode as string | null) ?? null,
    ingredients_raw: (row.ingredients_raw as string | null) ?? null,
    nutrition: (row.nutrition as ProductNutrition | null) ?? null,
    attributes: (row.attributes as Record<string, string> | null) ?? null,
    raw_payload: null,
    scraped_at: row.scraped_at as string,
    updated_at: row.updated_at as string,
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
      .not("raw_payload", "is", null),
    supabase.from("core_scores").select("product_id", { count: "exact", head: true }),
  ]);

  return {
    total: totalRes.count ?? 0,
    withDetail: detailRes.count ?? 0,
    scored: scoredRes.count ?? 0,
  };
}

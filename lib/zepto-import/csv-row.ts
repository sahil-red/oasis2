import { mapToCanonicalTaxonomy } from "@/lib/catalog/policy";
import {
  isNullCsvCell,
  looksLikeInlineNutritionFacts,
  parseCsvNutritionCell,
} from "@/lib/zepto-import/parse-csv-nutrition";
import {
  buildProductSlugFromVariant,
  type ZeptoImportIdentity,
} from "@/lib/zepto-import/product-key";
import { parseCsvImageUrls } from "@/lib/zepto-import/parse-csv-image";
import { normalizeFormattedPacksize } from "@/lib/zepto-import/parse-formatted-packsize";
import { isZeptoVariantId } from "@/lib/zepto-import/variant-id";
import type { ProductNutrition } from "@/lib/supabase/types";

export type ZeptoCsvRow = {
  super_category: string | null;
  category: string | null;
  subcategory: string | null;
  l3_category: string | null;
  brand: string;
  name: string;
  pack_size: string | null;
  mrp_inr: number | null;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  product_key: string;
  slug: string;
  /** Real Zepto product_variant_id (UUID in PDP URL). */
  zepto_sku: string;
  product_url: string;
  image_urls: string[];
};

const OUT_OF_SCOPE_CATEGORIES = new Set(["zepto cafe"]);

const COLUMN_ALIASES: Record<string, string[]> = {
  variant_id: [
    "product_variant_id",
    "variant_id",
    "productvariantid",
    "pvid",
    "zepto_sku",
    "sku_id",
  ],
  super_category: ["super_category", "l1", "l1_category"],
  category: ["category_name", "category", "l2", "l2_category", "parent_category"],
  subcategory: ["subcategory", "subcategory_name", "l2_subcategory", "shelf"],
  l3_category: ["l3_category", "l3", "l3_category_name", "use_case", "usecase", "sub_subcategory"],
  brand: ["brand", "brand_name", "manufacturer"],
  name: ["name", "product_name", "title", "sku_name"],
  pack_size: [
    "pack_size",
    "packsize",
    "pack",
    "net_weight",
    "weight",
    "weight_in_gms",
    "weight_in_gm",
    "unit",
    "formatted_packsize",
  ],
  mrp: ["mrp", "mrp_inr", "max_retail_price", "mrp_paise"],
  ingredients: ["ingredients", "ingredients_raw", "ingredient", "ingredient_list"],
  nutrition: [
    "nutrition",
    "nutritional_info",
    "nutrition_information",
    "nutrition_info",
    "nutrition_facts",
  ],
  image_link: [
    "image_links",
    "image_link",
    "image_url",
    "image",
    "product_image",
    "thumbnail",
    "primary_image",
  ],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function pickColumn(headers: string[], aliases: string[]): string | null {
  const norm = headers.map((h) => ({ raw: h, n: normalizeHeader(h) }));
  for (const alias of aliases) {
    const hit = norm.find((x) => x.n === alias || x.n.includes(alias));
    if (hit) return hit.raw;
  }
  return null;
}

export function resolveCsvColumns(
  headers: string[],
): Record<keyof typeof COLUMN_ALIASES, string | null> {
  const out = {} as Record<keyof typeof COLUMN_ALIASES, string | null>;
  for (const key of Object.keys(COLUMN_ALIASES) as Array<keyof typeof COLUMN_ALIASES>) {
    out[key] = pickColumn(headers, COLUMN_ALIASES[key]);
  }
  return out;
}

function cell(row: Record<string, string>, col: string | null): string {
  if (!col) return "";
  const v = (row[col] ?? "").trim();
  return isNullCsvCell(v) ? "" : v;
}

function parseMrp(raw: string): number | null {
  if (!raw) return null;
  const n = Number.parseFloat(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return n > 5000 ? n / 100 : n;
}

function slugifyForUrl(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function isOutOfScopeCategory(category: string | null): boolean {
  if (!category?.trim()) return false;
  return OUT_OF_SCOPE_CATEGORIES.has(category.trim().toLowerCase());
}

export function csvRecordToRow(
  record: Record<string, string>,
  cols: Record<keyof typeof COLUMN_ALIASES, string | null>,
): ZeptoCsvRow | null {
  const variantId = cell(record, cols.variant_id);
  if (!isZeptoVariantId(variantId)) return null;

  const name = cell(record, cols.name);
  const brand = cell(record, cols.brand);
  if (!name || !brand) return null;

  const super_category = cell(record, cols.super_category) || null;
  const category = cell(record, cols.category) || super_category;
  if (isOutOfScopeCategory(category)) return null;

  const subcategory = cell(record, cols.subcategory) || null;
  const l3_category = cell(record, cols.l3_category) || null;
  const pack_size = normalizeFormattedPacksize(cell(record, cols.pack_size));
  let ingredients_raw = cell(record, cols.ingredients) || null;
  let nutrition = parseCsvNutritionCell(cell(record, cols.nutrition));

  if (!nutrition && ingredients_raw && looksLikeInlineNutritionFacts(ingredients_raw)) {
    nutrition = parseCsvNutritionCell(ingredients_raw);
    ingredients_raw = null;
  }

  const identity: ZeptoImportIdentity = {
    brand,
    name,
    pack_size: pack_size ?? "",
    l3_category,
    subcategory,
  };
  const product_key = variantId;
  const slug = buildProductSlugFromVariant(identity, variantId);
  const product_url = `https://www.zepto.com/pn/${slugifyForUrl(name)}/pvid/${variantId}`;
  const image_urls = parseCsvImageUrls(cell(record, cols.image_link));

  const canon = mapToCanonicalTaxonomy({
    platform: "zepto",
    super_category,
    category,
    subcategory: l3_category ?? subcategory,
  });

  return {
    super_category,
    category: canon.category ?? category,
    subcategory: canon.subcategory ?? subcategory,
    l3_category,
    brand,
    name,
    pack_size,
    mrp_inr: parseMrp(cell(record, cols.mrp)),
    ingredients_raw,
    nutrition,
    product_key,
    slug,
    zepto_sku: variantId,
    product_url,
    image_urls,
  };
}

/** Dedupe by variant id — keep row with richest nutrition/ingredients. */
export function dedupeCsvRows(rows: ZeptoCsvRow[]): ZeptoCsvRow[] {
  const score = (r: ZeptoCsvRow) => {
    let s = 0;
    if (r.image_urls.length) s += 1;
    if (r.nutrition && Object.keys(r.nutrition).length > 2) s += 2;
    if (r.ingredients_raw?.trim()) s += 1;
    return s;
  };
  const byId = new Map<string, ZeptoCsvRow>();
  for (const row of rows) {
    const prev = byId.get(row.zepto_sku);
    if (!prev || score(row) > score(prev)) byId.set(row.zepto_sku, row);
  }
  return [...byId.values()];
}

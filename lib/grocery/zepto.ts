/**
 * Zepto adapter — PDP API gives ingredients + per-100g nutrition (primary);
 * label OCR on carousel images is the fallback when PDP text is missing.
 *
 * Endpoint inventory (verified against www.zepto.com web client, May 2026):
 *
 *   GET  product-assortment-service/api/v2/category/grid
 *        → marketplace category grid (super → L1 → L2 subcategories).
 *
 *   GET  product-assortment-service/api/v2/store-products-by-store-subcategory-id
 *        ?storeId=&subcategoryId=&pageNumber=
 *        → paginated PLP for a subcategory.
 *
 *   GET  product-assortment-service/api/v2/product-detail
 *        ?storeId=&productVariantId=
 *        → full PDP (ingredients on product; variant in storeProducts[]).
 *
 * Base URL: https://bff-gateway.zepto.com/ (NEXT_PUBLIC_ZEPTO_CF_BFF_URL).
 * Legacy api.zepto.co.in/inventory/catalogue/* paths return 404.
 *
 *   GROCERY_PLATFORM=zepto pnpm warm-session -- --platform=zepto
 */
import { fetchJson, type ThrottledFetch } from "./http";
import { makePlaywrightFetch } from "./http-playwright";
import { parseZeptoDetailPayload } from "./parse-zepto-detail";
import { mergeRscIntoZeptoFields } from "./parse-zepto-rsc";
import type {
  GroceryAdapter,
  GrocerySession,
  PaginatedProducts,
  Platform,
  ScrapedCategory,
  ScrapedProductDetail,
  ScrapedProductSummary,
} from "./types";

const WEB_ORIGIN = "https://www.zepto.com";
/** BFF gateway — matches Zepto web client (lib chunk 91631 / 3133). */
const API = (
  process.env.ZEPTO_BFF_URL ??
  process.env.NEXT_PUBLIC_ZEPTO_CF_BFF_URL ??
  "https://bff-gateway.zepto.com/"
).replace(/\/?$/, "/");
const PAS = "product-assortment-service/api";

type ZeptoNode = Record<string, unknown>;

function dig(node: unknown, ...path: (string | number)[]): unknown {
  let cur: unknown = node;
  for (const p of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[p];
  }
  return cur;
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function paiseToInr(v: unknown): number | null {
  const n = asNumber(v);
  if (n == null) return null;
  return n > 500 ? n / 100 : n;
}

function humanizeSlug(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** store_id from warm-session headers, session.extra, or env. */
export function resolveZeptoStoreId(session: GrocerySession): string | null {
  const fromExtra = session.extra?.store_id?.trim();
  if (fromExtra) return fromExtra;
  const fromEnv = process.env.ZEPTO_STORE_ID?.trim();
  if (fromEnv) return fromEnv;
  const h = session.headers;
  const fromHeader =
    (typeof h.store_id === "string" && h.store_id.trim()) ||
    (typeof h.storeid === "string" && h.storeid.trim()) ||
    (typeof h.store_ids === "string" && h.store_ids.split(",")[0]?.trim());
  return fromHeader || null;
}

function requireStoreId(session: GrocerySession): string {
  const id = resolveZeptoStoreId(session);
  if (!id) {
    throw new Error(
      "[zepto] store_id missing. Run:\n" +
        "  GROCERY_PLATFORM=zepto pnpm warm-session -- --platform=zepto\n" +
        "Pin an address on zepto.com, wait for the home page to load, then press ENTER.\n" +
        "Or set ZEPTO_STORE_ID= in .env.local",
    );
  }
  return id;
}

function zeptoHeaders(session: GrocerySession, sid?: string): Record<string, string> {
  const headers: Record<string, string> = {
    ...session.headers,
    accept: "application/json",
    "content-type": "application/json",
    platform: session.headers.platform ?? "WEB",
    origin: WEB_ORIGIN,
    referer: `${WEB_ORIGIN}/`,
  };
  if (!headers.compatible_components) {
    headers.compatible_components = "CONVENIENCE_FEE,RAIN_FEE,EXTERNAL_COUPONS";
  }
  if (sid) {
    headers.store_id = sid;
    headers.storeid = sid;
  }
  return headers;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function listingNodes(item: ZeptoNode): { product: ZeptoNode; variant: ZeptoNode } {
  const product = ((item.product as ZeptoNode | undefined) ?? item) as ZeptoNode;
  const variant = ((item.productVariant as ZeptoNode | undefined) ??
    (product.productVariant as ZeptoNode | undefined) ??
    product) as ZeptoNode;
  return { product, variant };
}

export class ZeptoAdapter implements GroceryAdapter {
  readonly platform: Platform = "zepto";
  private readonly rps: number;
  private readonly burst: number;
  private cachedHttp: ThrottledFetch | null = null;

  constructor(opts: { rps?: number; burst?: number } = {}) {
    this.rps = opts.rps ?? 2;
    this.burst = opts.burst ?? (Number(process.env.GROCERY_BURST) || 1);
  }

  recycleBrowser(): void {
    this.cachedHttp = null;
  }

  private http(session: GrocerySession): ThrottledFetch {
    if (!session.storage_state_path) {
      throw new Error(
        "[zepto] storage_state_path required — run pnpm warm-session -- --platform=zepto",
      );
    }
    if (!this.cachedHttp) {
      this.cachedHttp = makePlaywrightFetch({
        storageStatePath: session.storage_state_path,
        origin: WEB_ORIGIN,
        rps: this.rps,
        burst: this.burst,
      });
    }
    return this.cachedHttp;
  }

  private sid(session: GrocerySession): string {
    return requireStoreId(session);
  }

  async *listTaxonomy(session: GrocerySession): AsyncGenerator<ScrapedCategory> {
    const sid = this.sid(session);
    const data = await fetchJson<ZeptoNode>(
      this.http(session),
      `${API}${PAS}/v2/category/grid?storeId=${encodeURIComponent(sid)}`,
      { headers: zeptoHeaders(session, sid), label: "zepto/category-grid" },
    );

    const grids = (dig(data, "categoryGridResponseList") as ZeptoNode[]) ?? [];
    for (const grid of grids) {
      const superSlug = asString(grid.parentCategoryName) ?? "grocery";
      const superName = humanizeSlug(superSlug);
      const superId = superSlug;
      const categories = (grid.categories as ZeptoNode[]) ?? [];

      for (const cat of categories) {
        const catName = asString(cat.name) ?? "General";
        const catId = asString(cat.id) ?? catName;
        const subs = (cat.availableSubcategories as ZeptoNode[]) ?? [];

        if (subs.length === 0) {
          yield {
            id: catId,
            super_category_id: superId,
            super_category_name: superName,
            name: catName,
            raw: cat,
          };
          continue;
        }

        for (const sub of subs) {
          const subName = asString(sub.name) ?? "General";
          const subId = asString(sub.id) ?? `${catId}-${subName}`;
          yield {
            id: subId,
            super_category_id: superId,
            super_category_name: superName,
            name: subName,
            parent_category_id: catId,
            parent_category_name: catName,
            raw: sub,
          };
        }
      }
    }
  }

  async listProducts(
    session: GrocerySession,
    category: ScrapedCategory,
    cursor?: string,
  ): Promise<PaginatedProducts> {
    const sid = this.sid(session);
    const page = cursor ? Number.parseInt(cursor, 10) : 1;
    const url =
      `${API}${PAS}/v2/store-products-by-store-subcategory-id` +
      `?storeId=${encodeURIComponent(sid)}` +
      `&subcategoryId=${encodeURIComponent(category.id)}` +
      `&pageNumber=${page}`;

    const data = await fetchJson<ZeptoNode>(this.http(session), url, {
      headers: zeptoHeaders(session, sid),
      label: `zepto/store-products/${category.id}`,
    });

    const items = (dig(data, "storeProducts") as ZeptoNode[]) ?? [];
    const products: ScrapedProductSummary[] = [];

    for (const item of items) {
      const { product, variant } = listingNodes(item);
      const sku =
        asString(variant.id) ??
        asString(variant.productVariantId) ??
        asString(product.id) ??
        asString(item.id);
      const name = asString(variant.name) ?? asString(product.name) ?? asString(item.name);
      if (!sku || !name) continue;

      const slugPart = asString(variant.slug) ?? asString(product.slug) ?? slugify(name);
      products.push({
        sku,
        name,
        brand: asString(variant.brand) ?? asString(product.brand) ?? null,
        thumb_url:
          asString(dig(variant, "images", 0, "path")) ??
          asString(dig(variant, "image", "path")) ??
          asString(item.imageUrl) ??
          null,
        price_inr: paiseToInr(
          item.sellingPrice ?? item.discountedSellingPrice ?? variant.sellingPrice,
        ),
        mrp_inr: paiseToInr(item.mrp ?? variant.mrp),
        net_weight: asString(variant.packsize) ?? asString(variant.formattedPacksize) ?? null,
        product_url: `${WEB_ORIGIN}/pn/${slugPart}/pvid/${sku}`,
        super_category: category.super_category_name,
        category: category.parent_category_name ?? category.super_category_name,
        subcategory: category.name,
        raw: item,
      });
    }

    const endOfList = Boolean(dig(data, "endOfList"));
    const hasMore = !endOfList && products.length > 0;
    return {
      products,
      next_cursor: hasMore ? String(page + 1) : null,
    };
  }

  async getProductDetail(session: GrocerySession, sku: string): Promise<ScrapedProductDetail> {
    const sid = this.sid(session);
    const url =
      `${API}${PAS}/v2/product-detail` +
      `?storeId=${encodeURIComponent(sid)}` +
      `&productVariantId=${encodeURIComponent(sku)}`;

    const data = await fetchJson<ZeptoNode>(this.http(session), url, {
      headers: zeptoHeaders(session, sid),
      label: `zepto/product/${sku}`,
    });

    let detail = parseZeptoDetailPayload(sku, data);

    if (detail.product_url) {
      try {
        const htmlRes = await this.http(session)(detail.product_url, {
          headers: {
            ...zeptoHeaders(session, sid),
            accept: "text/html,application/xhtml+xml",
          },
          label: `zepto/pdp-html/${sku.slice(0, 8)}`,
        });
        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const merged = mergeRscIntoZeptoFields({
            html,
            ingredients_raw: detail.ingredients_raw,
            nutrition: detail.nutrition,
            attributes: detail.attributes ?? {},
          });
          detail = {
            ...detail,
            ingredients_raw: merged.ingredients_raw,
            nutrition: merged.nutrition,
            attributes: merged.attributes,
          };
        }
      } catch {
        // BFF-only fallback when PDP HTML fetch fails (CF, timeout).
      }
    }

    return detail;
  }
}

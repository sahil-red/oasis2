import type { ProductNutrition } from "@/lib/supabase/types";

/**
 * Platform-agnostic grocery scraping interfaces.
 *
 * The scoring engine doesn't care which Indian quick-commerce app sourced
 * a product — it sees `ScrapedProduct`. Concrete adapters in `./blinkit.ts`,
 * `./zepto.ts`, etc. implement `GroceryAdapter` and translate that platform's
 * payload shape into this canonical form.
 */

export type Platform = "blinkit" | "zepto" | "swiggy";

export interface GrocerySession {
  /** Identifier of the platform this session targets. */
  platform: Platform;
  /** Cookie header string. Used by the curl/fetch HTTP backends. Empty when
   *  the Playwright backend is in use — there, cookies live in storage_state. */
  cookies: string;
  /** Static request headers (user-agent, app_client, app_version, etc.). */
  headers: Record<string, string>;
  /** Lat/lng pinned by the user; many platforms gate the catalog on this. */
  location?: { lat: number; lng: number; pin?: string; city?: string };
  /**
   * Path to a Playwright storageState JSON file capturing cookies +
   * localStorage from a real Chromium session. When set, the Blinkit
   * adapter will route requests through Playwright's page.evaluate(fetch)
   * — the only reliably-working path against Cloudflare bot manager.
   */
  storage_state_path?: string;
  /** Anything platform-specific the adapter needs to persist between runs. */
  extra?: Record<string, string>;
  /** ISO timestamp when this session was last verified usable. */
  warmed_at: string;
}

export interface ScrapedSuperCategory {
  id: string;
  name: string;
  slug?: string;
  image_url?: string;
  raw?: unknown;
}

export interface ScrapedCategory {
  id: string;
  super_category_id: string;
  super_category_name: string;
  name: string;
  slug?: string;
  image_url?: string;
  /** Some platforms split into a third level (subcategory). When that happens
   *  each subcategory is returned as its own ScrapedCategory with this
   *  reference pointing back to the parent category id. */
  parent_category_id?: string;
  parent_category_name?: string;
  raw?: unknown;
}

export interface ScrapedProductSummary {
  /** Platform-native SKU/variant id. Used as the primary dedup key. */
  sku: string;
  name: string;
  brand: string | null;
  thumb_url: string | null;
  price_inr: number | null;
  mrp_inr: number | null;
  net_weight: string | null;
  product_url: string;
  /** Carry the category context forward so the detail call doesn't have to refetch. */
  super_category: string | null;
  category: string | null;
  subcategory: string | null;
  raw?: unknown;
}

export interface ScrapedProductDetail extends ScrapedProductSummary {
  /** Every image the platform returned. Front-of-pack first, then back-label.
   *  Order matters — the OCR step picks the LAST image as the most-likely
   *  back-label by convention, falling back to scoring every image if needed. */
  image_urls: string[];
  /** EAN/UPC if exposed. The OFF lookup is keyed on this. */
  barcode: string | null;
  /**
   * Ingredient list with %ages. Blinkit publishes this for high-volume SKUs
   * (think Lay's, Maggi, Britannia) but skips it for the long tail.
   *
   * Source-of-truth resolution at scoring time:
   *   • If non-null here → trust it; ingredients OCR is skipped.
   *   • If null         → fall back to OCR on the back-label image.
   */
  ingredients_raw: string | null;
  /**
   * Per-100g nutrition (and serving size in `extra` when relevant). Blinkit's
   * structured fields are PRIMARY here — they're consistently populated for
   * almost every SKU because FSSAI mandates display of the nutrition table.
   * OCR is only used as a fallback (and as a cross-check) when this is null.
   *
   * Adapters return a loose shape; the normaliser tightens it to ProductNutrition.
   */
  nutrition: ProductNutrition | null;
  /** Short marketing description. */
  description: string | null;
  /** Mandatory FSSAI license number printed on every Indian package. */
  fssai_license: string | null;
  /**
   * EVERY remaining platform-published attribute as a flat string→string map.
   * Things like "Country of Origin", "Diet Preference", "Shelf Life",
   * "Allergen Information", "Type", "Flavour", "Key Features", "Disclaimer",
   * "Customer Care Details", "Seller", "Seller FSSAI", "Return Policy", etc.
   * Used for the product-detail UI; NOT for scoring.
   */
  attributes: Record<string, string>;
  /**
   * EVERY free-text blob the platform returned, labelled by source key
   * (e.g. {"description": "...", "key_features": "...", "disclaimer": "..."}).
   * Phase 3 will regex-scan these as a last-resort hint when ingredients/nutrition
   * are missing, before falling back to OCR. Keep this verbose: when in doubt,
   * include it.
   */
  text_blobs: Record<string, string>;
  /** Url back to the platform's product page (for attribution). */
  raw_payload: unknown;
}

export interface PaginatedProducts {
  products: ScrapedProductSummary[];
  next_cursor: string | null;
}

export interface GroceryAdapter {
  readonly platform: Platform;
  /** Walk the platform's taxonomy. Implementations should yield in the order
   *  a user would naturally browse (top-level first). */
  listTaxonomy(session: GrocerySession): AsyncGenerator<ScrapedCategory>;
  /** Paginate one category. `cursor` is an opaque token from the previous page. */
  listProducts(
    session: GrocerySession,
    category: ScrapedCategory,
    cursor?: string,
  ): Promise<PaginatedProducts>;
  /** Fetch the full payload for one SKU. */
  getProductDetail(session: GrocerySession, sku: string): Promise<ScrapedProductDetail>;
}

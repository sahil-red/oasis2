/**
 * Blinkit adapter — primary platform.
 *
 * Endpoint inventory (verified against blinkit.com web client, late 2025
 * via scripts/spy-blinkit.ts):
 *
 *   GET  /feed/?template_version=9
 *        → homepage feed. The 20-tile "Shop by category" grid is at
 *        `objects[].data.items[]` for the object whose
 *        `data.widget_name` matches /shop_by_category/. Each tile has
 *        `image_title` ("1 - Paan Corner"), `deeplink`
 *        ("grofers://listing?l0_cat=229&l1_cat=1982"), `image`, `id`.
 *        There is NO /v1/layout/categories endpoint anymore (returns 404).
 *
 *   POST /v1/layout/listing_widgets?l0_cat={l0}&l1_cat={l1}
 *        body: {}
 *        → FIRST page of a category. Returns up to 15 product cards as
 *        snippets of widget_type "product_card_snippet_type_2", plus
 *        `response.pagination.next_url` (a fully-formed URL for page 2)
 *        and `postback_params` (the opaque cursor as a JSON object).
 *
 *   POST <response.pagination.next_url>
 *        body: <postback_params from previous page, with
 *               is_subsequent_page=true>
 *        → subsequent pages.
 *
 *   POST /v1/layout/product/{product_id}     (body: {})
 *        → full product detail. Returns a SNIPPET tree (not a flat product
 *        object) — same widget format as the listing endpoints. Verified
 *        against the live web client via scripts/spy-blinkit.ts. Important
 *        wrinkles:
 *          • Must be POST. A GET returns a generic 404 page (not 405).
 *          • Body is the empty JSON object {}.
 *          • Referer must look like a PDP URL (/prn/<slug>/prid/<id>).
 *
 *        Where the data lives inside the snippet tree:
 *          • response.snippets[0].data.itemList[*].data.media_content.image.url
 *              → image carousel (5–15 hi-res photos including back labels)
 *          • response.snippets[*].data.rfc_actions_v2.default[0]
 *              .remove_from_cart.cart_item
 *              → canonical fields: name, brand, price, mrp, unit, image_url,
 *                merchant_id, group_id, merchant_type
 *          • response.snippet_list_updater_data.expand_attributes.payload
 *              .snippets_to_add[*].data
 *              → ~30 key/value rows that include the FSSAI-mandated nutrition
 *                table (per 100g), the full ingredients string with %ages,
 *                FSSAI license number, allergen info, country of origin, etc.
 *                These are returned eagerly but UI-collapsed until the user
 *                taps "View more details" — so they're already in the payload.
 *
 * All requests require these client hint headers (set by the web app):
 *
 *   app_client:      "consumer_web"
 *   app_version:     "1.0.0"
 *   web_app_version: "1008010001"
 *   device_id:       <stable per-browser UUID>
 *   lat / lon:       set by serviceability check after user picks an address
 *   auth_key:        cdac9b3...  (public web app static key, not user-specific)
 *   session_uuid:    rotated per browser session, may be empty
 *
 * Plus standard cookies (gr_1_*, gr_2_*) and the "x-cm-ip" / "tee-token" pair
 * that Akamai's bot manager checks on the way in. All of those are populated
 * by `scripts/00-warm-session.ts`.
 *
 * Endpoint shape is defensive — if Blinkit drops or renames fields, the
 * adapter degrades to null on a per-field basis instead of throwing. Raw
 * payloads are always preserved in `raw_payload`, so re-extracting from a
 * scraped dump after a schema change is just a normalizer rewrite.
 */

import { fetchJson, makeThrottledFetch, type ThrottledFetch } from "./http";
import { makeCurlFetch } from "./http-curl";
import { makePlaywrightFetch } from "./http-playwright";
import {
  mergeNutrition,
  parseServingNutritionBlock,
} from "@/lib/grocery/parse-nutrition-block";
import type { ProductNutrition } from "@/lib/supabase/types";
import type {
  GroceryAdapter,
  GrocerySession,
  PaginatedProducts,
  Platform,
  ScrapedCategory,
  ScrapedProductDetail,
  ScrapedProductSummary,
} from "./types";

const BASE = "https://blinkit.com";

interface BlinkitNode {
  // Blinkit's widget tree is heavily nested and field names drift over time.
  // We treat it as untyped JSON and dig with safe getters.
  [k: string]: unknown;
}

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

export class BlinkitAdapter implements GroceryAdapter {
  readonly platform: Platform = "blinkit";
  private readonly rps: number;
  private readonly burst: number;
  private readonly backendOverride: string | null;
  private cachedHttp: { fn: ThrottledFetch; key: string } | null = null;

  constructor(opts: { rps?: number; burst?: number } = {}) {
    this.rps = opts.rps ?? 2;
    this.burst = opts.burst ?? (Number(process.env.GROCERY_BURST) || 1);
    this.backendOverride = process.env.HTTP_BACKEND
      ? process.env.HTTP_BACKEND.toLowerCase()
      : null;
  }

  /** Drop cached Playwright fetcher so the next call launches a new browser. */
  recycleBrowser(): void {
    this.cachedHttp = null;
  }

  /**
   * Resolve the HTTP backend for this session.
   *
   * Precedence:
   *   1. HTTP_BACKEND env var (explicit override)
   *   2. Playwright (if the session has a saved storage state — this is
   *      the only backend that reliably passes Cloudflare bot manager)
   *   3. curl (system curl subprocess; works on some less-aggressive origins)
   *   4. fetch (Node undici; documented to 403 on Blinkit, kept for tests)
   *
   * Cached across calls so we don't re-launch Chromium per request.
   */
  private http(session: GrocerySession): ThrottledFetch {
    let backend: string;
    if (this.backendOverride) {
      backend = this.backendOverride;
    } else if (session.storage_state_path) {
      backend = "playwright";
    } else {
      backend = "curl";
    }

    const key = `${backend}::${session.storage_state_path ?? ""}`;
    if (this.cachedHttp && this.cachedHttp.key === key) {
      return this.cachedHttp.fn;
    }

    let fn: ThrottledFetch;
    if (backend === "playwright") {
      if (!session.storage_state_path) {
        throw new Error(
          "[blinkit] HTTP_BACKEND=playwright requires session.storage_state_path. " +
            "Run `pnpm warm-session --playwright` first.",
        );
      }
      fn = makePlaywrightFetch({
        storageStatePath: session.storage_state_path,
        rps: this.rps,
        burst: this.burst,
      });
    } else if (backend === "fetch") {
      fn = makeThrottledFetch({ rps: this.rps, burst: this.burst });
    } else {
      fn = makeCurlFetch({ rps: this.rps, burst: this.burst });
    }

    this.cachedHttp = { fn, key };
    return fn;
  }

  /**
   * Build the request header set.
   *
   * Order of precedence (later wins):
   *   1. Hardcoded sensible defaults (Bengaluru fallback, consumer_web client)
   *   2. Captured browser headers from warm-session
   *   3. Per-call locked headers (cookie, referer, lat/lon) — these are the
   *      ones we DON'T want a stale captured value to override:
   *        • cookie  → always from session.cookies (session.headers excludes it)
   *        • referer → set per-endpoint, because Blinkit's edge rules check
   *                    that you "claim" to be on the matching page
   *                    (product API requires referer to be a /prn/.../prid/ URL).
   *        • lat/lon → use the parsed location object if present, since the
   *                    captured header values can drift across cURL captures.
   */
  private headers(session: GrocerySession, referer?: string): HeadersInit {
    const merged: Record<string, string> = {
      "app_client": "consumer_web",
      "app_version": "52434332",
      "web_app_version": "1008010016",
      "rn_bundle_version": "1009003012",
      "platform": "mobile_web",
      "auth_key": "c761ec3633c22afad934fb17a66385c1c06c5472b4898b866b7306186d0bb477",
      // Stable per session — a fresh UUID on every request trips bot checks.
      "device_id":
        session.headers["device_id"] ??
        session.extra?.device_id ??
        randUuid(),
      "session_uuid": "",
      "lat": "12.9716",
      "lon": "77.5946",
      "content-type": "application/json",
      "accept": "*/*",
      "x-age-consent-granted": "false",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "origin": BASE,
      "referer": `${BASE}/`,
      // Captured session headers override any default above.
      ...session.headers,
      // Lock cookie/referer/lat/lon AFTER the spread so stale captured
      // values never reach the wire.
      "cookie": session.cookies,
    };
    if (referer) merged["referer"] = referer;
    if (session.location) {
      merged["lat"] = String(session.location.lat);
      merged["lon"] = String(session.location.lng);
    }
    return merged;
  }

  async *listTaxonomy(session: GrocerySession): AsyncGenerator<ScrapedCategory> {
    // Blinkit retired /v1/layout/categories — the only place the full
    // category grid lives now is the homepage feed.
    const data = await fetchJson<BlinkitNode>(
      this.http(session),
      `${BASE}/feed/?template_version=9`,
      { headers: this.headers(session, `${BASE}/`), label: "blinkit/feed" },
    );

    const objects = (data.objects as BlinkitNode[]) ?? [];

    // Find the "Shop by category" grid. Identified by data.widget_name
    // containing "shop_by_category" (defensive against A/B-test renames).
    const grid = objects.find((o) => {
      const name = asString(dig(o, "data", "widget_name")) ?? "";
      return /shop[_ ]?by[_ ]?category/i.test(name);
    });

    if (!grid) {
      throw new Error(
        "[blinkit] couldn't locate the Shop-by-Category grid in /feed/. " +
          "Blinkit's feed shape may have changed — run scripts/spy-blinkit.ts " +
          "on https://blinkit.com/ and update lib/grocery/blinkit.ts.",
      );
    }

    const items = (dig(grid, "data", "items") as BlinkitNode[]) ?? [];
    for (const it of items) {
      const id = asString(it.id);
      const deeplink = asString(it.deeplink) ?? "";
      const image = asString(it.image);
      // Title format: "<rank> - <name>" — strip the leading number/dash.
      const rawTitle = asString(it.image_title) ?? "";
      const name = rawTitle.replace(/^\s*\d+\s*-\s*/, "").trim();

      // Extract l0_cat + l1_cat from the deeplink:
      //   grofers://listing?l0_cat=229&l1_cat=1982
      const l0Match = /l0_cat=(\d+)/.exec(deeplink);
      const l1Match = /l1_cat=(\d+)/.exec(deeplink);
      if (!l0Match || !l1Match || !name) continue;
      const l0_cat = l0Match[1];
      const l1_cat = l1Match[1];

      yield {
        // We use the l1_cat as the category id (it's what the listing
        // endpoint paginates against). l0_cat goes in super_category_id.
        id: l1_cat,
        super_category_id: l0_cat,
        // Blinkit's homepage grid doesn't surface an L0 display name —
        // for now we use the same name (most L0/L1 pairs are 1:1 here).
        super_category_name: name,
        name,
        slug: undefined,
        image_url: image ?? undefined,
        raw: { ...it, l0_cat, l1_cat, source_id: id },
      };
    }
  }

  async listProducts(
    session: GrocerySession,
    category: ScrapedCategory,
    cursor?: string,
  ): Promise<PaginatedProducts> {
    let url: string;
    let body: string;
    let label: string;

    if (!cursor) {
      // First page: l0_cat + l1_cat as query params, empty body.
      url =
        `${BASE}/v1/layout/listing_widgets` +
        `?l0_cat=${encodeURIComponent(category.super_category_id)}` +
        `&l1_cat=${encodeURIComponent(category.id)}`;
      body = "{}";
      label = `blinkit/listing/${category.id}`;
    } else {
      // Subsequent pages: cursor is the prior `postback_params` object
      // (JSON-stringified). The fully-formed next URL was returned by the
      // previous page; we recover it from the cursor envelope below.
      const envelope = JSON.parse(cursor) as {
        next_url: string;
        postback_params: BlinkitNode;
      };
      url = envelope.next_url.startsWith("http")
        ? envelope.next_url
        : `${BASE}${envelope.next_url}`;
      body = JSON.stringify({
        ...envelope.postback_params,
        is_subsequent_page: true,
      });
      label = `blinkit/listing/${category.id}+cursor`;
    }

    // The category page sets the referer to /cn/<slug>/cid/<l0>/<l1>.
    // We don't have a slug here, so we use "x" — Blinkit's edge tolerates
    // any value as long as the l0/l1 ids match.
    const referer = `${BASE}/cn/x/cid/${category.super_category_id}/${category.id}`;

    const data = await fetchJson<BlinkitNode>(this.http(session), url, {
      method: "POST",
      body,
      headers: this.headers(session, referer),
      label,
    });

    const products: ScrapedProductSummary[] = [];
    const snippets = (dig(data, "response", "snippets") as BlinkitNode[]) ?? [];

    for (const node of snippets) {
      const wtype = asString(node.widget_type);
      // Product cards live in widget types like "product_card_snippet_type_2".
      // Filter by widget_type prefix to skip section headers, banners, etc.
      if (!wtype || !wtype.startsWith("product_card_snippet")) continue;

      const d = dig(node, "data") as BlinkitNode | undefined;
      if (!d) continue;

      const sku = asString(dig(d, "identity", "id")) ?? asString(d.product_id);
      if (!sku) continue;

      // The cart_item under rfc/atc actions has the cleanest pre-typed
      // values (price as a number, brand as a plain string).
      const cartItem =
        (dig(d, "rfc_action", "default", 0, "remove_from_cart", "cart_item") as BlinkitCartItem | undefined) ??
        (dig(d, "atc_action", "default", 0, "add_to_cart", "cart_item") as BlinkitCartItem | undefined) ??
        {};

      products.push({
        sku,
        name:
          asString(dig(d, "name", "text")) ??
          asString(cartItem.product_name) ??
          asString(cartItem.display_name) ??
          "Unknown",
        brand:
          asString(dig(d, "brand_name", "text")) ??
          asString(cartItem.brand) ??
          null,
        thumb_url:
          asString(dig(d, "image", "url")) ??
          asString(cartItem.image_url) ??
          null,
        price_inr:
          asNumber(cartItem.price) ??
          asNumber(asString(dig(d, "normal_price", "text"))),
        mrp_inr:
          asNumber(cartItem.mrp) ??
          asNumber(asString(dig(d, "mrp", "text"))),
        net_weight:
          asString(dig(d, "variant", "text")) ??
          asString(cartItem.unit) ??
          null,
        product_url: `${BASE}/prn/x/prid/${sku}`,
        super_category: category.super_category_name,
        category: category.name,
        subcategory: null,
        raw: d,
      });
    }

    // Pagination: combine next_url + postback_params into a JSON cursor.
    const nextUrl = asString(dig(data, "response", "pagination", "next_url"));
    const postbackParams = dig(data, "postback_params") as BlinkitNode | undefined;
    const nextCursor =
      nextUrl && postbackParams
        ? JSON.stringify({ next_url: nextUrl, postback_params: postbackParams })
        : null;

    return { products, next_cursor: nextCursor };
  }

  async getProductDetail(
    session: GrocerySession,
    sku: string,
  ): Promise<ScrapedProductDetail> {
    // Blinkit's edge rule on /v1/layout/product/<id> validates that the
    // referer is a product page (/prn/<slug>/prid/<id>). We don't know the
    // slug here, so we use `x` as the slug placeholder — the API accepts
    // any non-empty slug as long as the prid matches.
    const referer = `${BASE}/prn/x/prid/${encodeURIComponent(sku)}`;
    const data = await fetchJson<BlinkitNode>(
      this.http(session),
      `${BASE}/v1/layout/product/${encodeURIComponent(sku)}`,
      {
        method: "POST",
        // Verified empty via scripts/spy-blinkit.ts (the web client sends `{}`).
        body: "{}",
        headers: this.headers(session, referer),
        label: `blinkit/product/${sku}`,
      },
    );

    return parseBlinkitProductDetail(sku, data);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Product-detail parser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Walks the snippet tree produced by POST /v1/layout/product/{sku} and
 * extracts a canonical ScrapedProductDetail. Exported so tests / the
 * peek diagnostic can reuse it against on-disk samples.
 */
export function parseBlinkitProductDetail(
  sku: string,
  data: BlinkitNode,
): ScrapedProductDetail {
  const snippets = (dig(data, "response", "snippets") as BlinkitNode[]) ?? [];
  const expandSnippets =
    (dig(
      data,
      "response",
      "snippet_list_updater_data",
      "expand_attributes",
      "payload",
      "snippets_to_add",
    ) as BlinkitNode[]) ?? [];

  // ── Image carousel ────────────────────────────────────────────────────
  // Carousel widget exposes itemList[*].data.media_content.image.url. We
  // also harvest the "Promotional banner" image_text snippets at the top of
  // expand_attributes — those are usually back-label / nutrition-table
  // photos and they're exactly what OCR needs.
  const image_urls = collectImageUrls(snippets, expandSnippets);

  // ── Canonical fields from the ATC strip ───────────────────────────────
  // Every snippet's rfc_actions_v2.default[0].remove_from_cart.cart_item
  // (when present) holds the canonical {product_name, brand, price, mrp,
  // unit, image_url, merchant_id, group_id, merchant_type}. We grab the
  // first non-empty cart_item found.
  const cartItem = findCartItem(snippets) ?? findCartItem(expandSnippets) ?? {};

  // ── Product title (preferred over cart_item.product_name when present) ─
  const titleSnippet = snippets.find(
    (s) => asString(s.widget_type) === "text_right_icons_rating_snippet_type",
  );
  const titleFromHeader = asString(dig(titleSnippet, "data", "title", "text"));

  // ── Key/value detail rows (the heart of the parser) ────────────────────
  // Each "b_image_text_snippet_type_3" widget in expand_attributes is a
  // {title.text → subtitle.text} pair. Examples:
  //   {title: "Protein Per 100 g (g)",   subtitle: "6.4 g"}
  //   {title: "Ingredients",             subtitle: "Potato (82%), …"}
  //   {title: "FSSAI License",           subtitle: "10014064000435"}
  //   {title: "Country of Origin",       subtitle: "India"}
  const detailRows = collectDetailRows(expandSnippets);

  // Slice the rows into ingredients / nutrition / FSSAI / everything else.
  const ingredients_raw = pickAttr(detailRows, ["ingredients", "ingredient list"]);
  const fssai_license = pickAttr(detailRows, [
    "fssai license",
    "fssai license no",
    "fssai license number",
    "fssai lic",
    "fssai",
  ]);
  const description = pickAttr(detailRows, ["description", "marketing description"]);
  const allergen_info = pickAttr(detailRows, ["allergen information", "allergen info", "allergens"]);
  const nutrition = parseNutrition(detailRows, {
    nutritionInformation: pickAttr(detailRows, [
      "nutrition information",
      "nutrition facts",
      "nutritional information",
    ]),
  });

  // Everything in detailRows that ISN'T canonical (name/price/etc) flows
  // into `attributes` so the UI can render the full PDP table.
  const NUTRITION_TITLE_RE = /per ?100 ?(?:g|ml)|calories|energy/i;
  const SKIP_FROM_ATTRS = new Set([
    "ingredients",
    "ingredient list",
    "fssai license",
    "fssai license no",
    "fssai license number",
    "fssai lic",
    "fssai",
    "description",
  ]);
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(detailRows)) {
    if (SKIP_FROM_ATTRS.has(k)) continue;
    if (NUTRITION_TITLE_RE.test(k)) continue; // already in nutrition
    attributes[titleCase(k)] = v;
  }
  // FSSAI is canonical but also useful to show in attributes for completeness.
  if (fssai_license) attributes["FSSAI License"] = fssai_license;
  if (allergen_info && !attributes["Allergen Information"]) {
    attributes["Allergen Information"] = allergen_info;
  }

  // ── text_blobs: long-form copy for Phase 3 fallback regex scans ────────
  const text_blobs: Record<string, string> = {};
  for (const key of ["description", "key features", "disclaimer", "ingredients"]) {
    const v = detailRows[key];
    if (v) text_blobs[key.replace(/ /g, "_")] = v;
  }

  return {
    sku,
    name:
      titleFromHeader ??
      asString(cartItem.product_name) ??
      asString(cartItem.display_name) ??
      "Unknown",
    brand: asString(cartItem.brand) ?? null,
    thumb_url: image_urls[0] ?? asString(cartItem.image_url) ?? null,
    price_inr: asNumber(cartItem.price) ?? null,
    mrp_inr: asNumber(cartItem.mrp) ?? null,
    net_weight:
      asString(cartItem.unit) ??
      detailRows["unit"] ??
      null,
    product_url: `${BASE}/prn/x/prid/${sku}`,
    // Category info isn't in the PDP response — comes from the listing step.
    super_category: null,
    category: null,
    subcategory: null,

    image_urls,
    // Blinkit doesn't expose EAN/UPC in the PDP. OCR is the only path.
    barcode: null,
    ingredients_raw,
    nutrition,
    description,
    fssai_license,
    attributes,
    text_blobs,
    raw_payload: data,
  };
}

/** Cart-item shape we care about, narrowed from BlinkitNode for parser ergonomics. */
interface BlinkitCartItem {
  product_id?: number;
  merchant_id?: number;
  product_name?: string;
  display_name?: string;
  brand?: string;
  price?: number;
  mrp?: number;
  unit?: string;
  image_url?: string;
  group_id?: number;
  merchant_type?: string;
}

function findCartItem(snippets: BlinkitNode[]): BlinkitCartItem | null {
  for (const s of snippets) {
    const candidates = [
      dig(s, "data", "rfc_actions_v2", "default", 0, "remove_from_cart", "cart_item"),
      dig(s, "data", "atc_actions_v2", "default", 0, "add_to_cart", "cart_item"),
    ];
    for (const c of candidates) {
      if (c && typeof c === "object") return c as BlinkitCartItem;
    }
  }
  return null;
}

function collectImageUrls(
  snippets: BlinkitNode[],
  expandSnippets: BlinkitNode[],
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (u: string | null | undefined) => {
    if (!u) return;
    const trimmed = u.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    urls.push(trimmed);
  };

  // 1) Main carousel.
  for (const s of snippets) {
    if (asString(s.widget_type) !== "carousal_list_vr") continue;
    const items = (dig(s, "data", "itemList") as BlinkitNode[]) ?? [];
    for (const it of items) {
      push(asString(dig(it, "data", "media_content", "image", "url")));
    }
    // The carousel's gallery action lists the same assets but in a flat,
    // larger form — useful if itemList is empty.
    const gallery =
      (dig(s, "data", "itemList", 0, "data", "click_action", "show_gallery", "assets") as BlinkitNode[]) ?? [];
    for (const a of gallery) push(asString(a.image_url));
  }

  // 2) Promotional banners in expand_attributes (often back-label photos).
  for (const s of expandSnippets) {
    if (asString(s.widget_type) !== "v2_image_text_snippet_type_19") continue;
    push(asString(dig(s, "data", "image", "url")));
  }

  return urls;
}

function collectDetailRows(expandSnippets: BlinkitNode[]): Record<string, string> {
  const rows: Record<string, string> = {};
  for (const s of expandSnippets) {
    if (asString(s.widget_type) !== "b_image_text_snippet_type_3") continue;
    const title = asString(dig(s, "data", "title", "text"));
    const subtitle = asString(dig(s, "data", "subtitle", "text"));
    if (!title || !subtitle) continue;
    rows[normaliseAttrKey(title)] = subtitle;
  }
  return rows;
}

function pickAttr(
  rows: Record<string, string>,
  aliases: string[],
): string | null {
  for (const alias of aliases) {
    const v = rows[alias];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

/** Lowercases, strips trailing punctuation, normalises whitespace. Used as the
 *  detailRows key. Crucially, this does NOT strip "(g)" / "per 100 g" suffixes,
 *  so the nutrition parser can match the full original title. */
function normaliseAttrKey(s: string): string {
  return s.toLowerCase().replace(/[.:]+$/g, "").replace(/\s+/g, " ").trim();
}

/** Maps "added sugars per 100 g (g)" → "Added Sugars Per 100 g (g)" for display.
 *  Keeps short connectors ("of", "and", "for", "to", "in") lowercase, and
 *  leaves "FSSAI" (and other known acronyms) UPPER. */
const TITLECASE_LOWER = new Set(["of", "and", "for", "to", "in", "the", "a"]);
const TITLECASE_UPPER = new Set(["fssai", "mrp", "mrp.", "fl", "uk", "usa", "eu"]);
function titleCase(s: string): string {
  return s
    .split(/(\s+)/)
    .map((token, i) => {
      if (/^\s+$/.test(token)) return token;
      const lower = token.toLowerCase();
      if (TITLECASE_UPPER.has(lower)) return lower.toUpperCase();
      if (i !== 0 && TITLECASE_LOWER.has(lower)) return lower;
      return lower[0].toUpperCase() + lower.slice(1);
    })
    .join("");
}

// ────────────────────────────────────────────────────────────────────────────
// Nutrition parser
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map of "normalised-title-fragment" → canonical ProductNutrition key.
 * Order matters: the first match wins, so put more-specific keys first
 * (e.g. "added sugars" before "sugar", "saturated fat" before "fat").
 */
// Order matters: more-specific patterns FIRST. In particular:
//   • "unsaturated fat" must be checked BEFORE "saturated fat" — otherwise
//     /saturated fat/ matches "unsaturated fat per 100 g (g)" and overwrites
//     the real saturated value with the unsaturated value.
//   • "added sugars" must be checked BEFORE "sugars".
//   • "total fat" / "total carbs" / "total sugar" before their bare versions.
const NUTRITION_KEY_MAP: Array<[RegExp, string]> = [
  [/added sugars?/, "added_sugar_g_100g"],
  [/total sugars?|^sugars?$/, "sugar_g_100g"],
  [/unsaturated fat/, "unsaturated_fat_g_100g"], // non-canonical → extra
  [/trans ?fat/, "trans_fat_g_100g"],
  [/saturated fat/, "saturated_fat_g_100g"],
  [/total fat|^fat$/, "fat_g_100g"],
  [/total carbohydrates?|^carbohydrates?$|^carbs$/, "carbs_g_100g"],
  [/protein/, "protein_g_100g"],
  [/sodium/, "sodium_mg_100g"],
  [/calcium/, "calcium_mg_100g"],
  [/iron/, "iron_mg_100g"],
  [/caffeine/, "caffeine_mg_100g"],
  [/cholesterol/, "cholesterol_mg_100g"], // non-canonical → extra
  [/dietary fibre|fibre|fiber/, "fiber_g_100g"],
  [/energy|calories?|kcal/, "energy_kcal_100g"],
];

const CANONICAL_NUTRITION_KEYS = new Set([
  "energy_kcal_100g",
  "protein_g_100g",
  "fat_g_100g",
  "saturated_fat_g_100g",
  "trans_fat_g_100g",
  "carbs_g_100g",
  "sugar_g_100g",
  "added_sugar_g_100g",
  "fiber_g_100g",
  "sodium_mg_100g",
  "calcium_mg_100g",
  "iron_mg_100g",
  "caffeine_mg_100g",
]);

function parseNutrition(
  rows: Record<string, string>,
  opts?: { nutritionInformation?: string | null },
): ProductNutrition | null {
  // Only consider rows whose title hints at a per-100g (or per-serve) figure.
  // FSSAI mandates per-100g, so that's our overwhelming-default basis.
  const PER_100_RE = /per ?100 ?(?:g|ml)|calories|energy/i;

  const canonical: Record<string, number> = {};
  const extra: Record<string, number | string> = {};

  for (const [rawKey, rawValue] of Object.entries(rows)) {
    if (rawKey === "nutrition information") continue;
    if (!PER_100_RE.test(rawKey)) continue;
    const value = parseNutritionValue(rawValue);
    if (value == null) continue;

    const mapped = matchNutritionKey(rawKey);
    if (mapped && CANONICAL_NUTRITION_KEYS.has(mapped)) {
      canonical[mapped] = value;
    } else if (mapped) {
      // Mapped to a known-but-non-canonical key (unsaturated fat, cholesterol).
      extra[mapped] = value;
    } else {
      // Unknown per-100g nutrient — keep verbatim under its display title.
      extra[titleCase(rawKey)] = value;
    }
  }

  // Serving / serve size lives in a sibling row.
  const servingSize = rows["serve size"] ?? rows["serving size"];
  if (servingSize) extra["serving_size"] = servingSize;

  let fromRows: ProductNutrition | null = null;
  if (Object.keys(canonical).length > 0 || Object.keys(extra).length > 0) {
    fromRows = { source: "platform", ...canonical };
    if (Object.keys(extra).length > 0) fromRows.extra = extra;
  }

  const blockText = opts?.nutritionInformation?.trim();
  const fromBlock = blockText ? parseServingNutritionBlock(blockText) : null;

  return mergeNutrition(fromRows, fromBlock);
}

function matchNutritionKey(rawKey: string): string | null {
  for (const [re, canonical] of NUTRITION_KEY_MAP) {
    if (re.test(rawKey)) return canonical;
  }
  return null;
}

function parseNutritionValue(raw: string): number | null {
  // Examples we need to handle: "6.4 g", "987 mg", "536 kcal", "0.1 g",
  // "< 0.5 g", "not detected", "Nil"
  const cleaned = raw.toLowerCase().trim();
  if (!cleaned || cleaned === "nil" || cleaned.includes("not detected")) return 0;
  const m = /([-+]?\d+(?:\.\d+)?)/.exec(cleaned);
  return m ? Number.parseFloat(m[1]) : null;
}

function randUuid(): string {
  // Stable-per-process device id. Persist in session.json if you want it
  // to survive restarts; here we just generate a fresh one per scraper run.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

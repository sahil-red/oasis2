/**
 * OpenFoodFacts (OFF) — free, open, community-maintained packaged food database.
 *
 * Two lookup paths:
 *   1. Barcode (most reliable, exact match)         GET /api/v2/product/{barcode}.json
 *   2. Search by name + brand (fallback, fuzzy)     GET /cgi/search.pl?...
 *
 * No API key required. Polite rate-limit ~10 req/sec. Includes Indian products
 * (well-covered for major brands like Amul, Britannia, Nestle, MTR, ITC).
 *
 * Docs: https://openfoodfacts.github.io/api-documentation/
 */

import { Agent, fetch as undiciFetch } from "undici";
import type { ProductNutrition } from "@/lib/supabase/types";

const OFF_BASE = "https://world.openfoodfacts.org";
const USER_AGENT = "Oasis-Catalog/0.1 (https://github.com/sahilyadav/oasis)";

// Some Macs lack the OFF cert chain in Node's CA bundle (corporate or stale OpenSSL).
// OFF is a read-only public API; safe to skip cert verification here.
const offDispatcher = new Agent({
  connect: { rejectUnauthorized: false, timeout: 15_000 },
  bodyTimeout: 30_000,
  headersTimeout: 30_000,
});

async function offFetch(url: string, signal?: AbortSignal): Promise<Response> {
  const res = await undiciFetch(url, {
    dispatcher: offDispatcher,
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal,
  } as Parameters<typeof undiciFetch>[1]);
  return res as unknown as Response;
}

export type OffProduct = {
  code: string;
  product_name?: string;
  brands?: string;
  ingredients_text?: string;
  ingredients_text_en?: string;
  nutriments?: Record<string, number | string>;
  serving_size?: string;
  nutrition_grades?: string;
  nova_group?: number;
  ecoscore_grade?: string;
  data_quality_warnings_tags?: string[];
  countries_tags?: string[];
};

export type OffMatch = {
  off: OffProduct;
  confidence: number;
  match_type: "barcode" | "name_brand" | "name_only";
};

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Convert OFF nutriments → our ProductNutrition shape. */
export function offToProductNutrition(off: OffProduct): ProductNutrition | null {
  const n = off.nutriments;
  if (!n) return null;

  const energy_kcal = num(n["energy-kcal_100g"]) ?? num(n["energy_100g"]) ?? undefined;
  const protein = num(n["proteins_100g"]);
  const carbs = num(n["carbohydrates_100g"]);
  const sugar = num(n["sugars_100g"]);
  const fiber = num(n["fiber_100g"]);
  const fat = num(n["fat_100g"]);
  const satFat = num(n["saturated-fat_100g"]);
  const transFat = num(n["trans-fat_100g"]);
  const sodium = num(n["sodium_100g"]);
  const salt = num(n["salt_100g"]);

  // OFF reports sodium in g; convert to mg. If only salt is given, sodium ≈ salt × 0.4
  const sodium_mg = sodium != null ? sodium * 1000 : salt != null ? salt * 1000 * 0.4 : undefined;

  // Need at least one substantive macro to be useful
  if (energy_kcal == null && protein == null && carbs == null && fat == null) return null;

  return {
    source: "off",
    energy_kcal_100g: energy_kcal,
    protein_g_100g: protein,
    carbs_g_100g: carbs,
    fiber_g_100g: fiber,
    sugar_g_100g: sugar,
    added_sugar_g_100g: undefined,
    fat_g_100g: fat,
    saturated_fat_g_100g: satFat,
    trans_fat_g_100g: transFat,
    sodium_mg_100g: sodium_mg,
    extra: {
      off_code: off.code,
      off_nutrition_grade: off.nutrition_grades ?? null,
      off_nova_group: off.nova_group ?? null,
      off_ecoscore: off.ecoscore_grade ?? null,
      serving_size_text: off.serving_size,
    },
  } as ProductNutrition;
}

export function offIngredients(off: OffProduct): string | null {
  return off.ingredients_text_en?.trim() || off.ingredients_text?.trim() || null;
}

/** Lookup by barcode (EAN/UPC). Most reliable. */
export async function offLookupByBarcode(
  barcode: string,
  signal?: AbortSignal,
): Promise<OffMatch | null> {
  if (!barcode) return null;
  const url = `${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const res = await offFetch(url, signal);
  if (!res.ok) return null;
  const json = (await res.json()) as { status: number; product?: OffProduct };
  if (json.status !== 1 || !json.product) return null;
  return { off: json.product, confidence: 0.95, match_type: "barcode" };
}

/** Search by name + brand (fuzzy). Returns best match if confidence high enough. */
export async function offSearchByName(
  name: string,
  brand: string | null,
  signal?: AbortSignal,
): Promise<OffMatch | null> {
  if (!name) return null;
  // Combine brand + name into search terms — more reliable than the brand tag filter
  // which sometimes returns HTML errors from OFF's search endpoint.
  const searchTerms = [brand, name].filter(Boolean).join(" ");
  const params = new URLSearchParams({
    search_terms: searchTerms,
    action: "process",
    json: "1",
    page_size: "8",
    sort_by: "popularity_key",
    fields: "code,product_name,brands,ingredients_text,ingredients_text_en,nutriments,serving_size,nutrition_grades,nova_group,ecoscore_grade,countries_tags",
  });
  const url = `${OFF_BASE}/cgi/search.pl?${params.toString()}`;
  const res = await offFetch(url, signal);
  if (!res.ok) return null;
  // Sometimes OFF returns HTML on errors — guard the JSON parse
  let json: { products?: OffProduct[] };
  try {
    json = await res.json() as { products?: OffProduct[] };
  } catch {
    return null;
  }
  const list = json.products ?? [];
  if (!list.length) return null;

  // Score each candidate by token overlap with input
  const inputTokens = new Set(`${brand ?? ""} ${name}`.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  let best: OffMatch | null = null;
  for (const p of list) {
    const offText = `${p.brands ?? ""} ${p.product_name ?? ""}`.toLowerCase();
    const offTokens = new Set(offText.split(/\s+/).filter(t => t.length > 2));
    let overlap = 0;
    for (const t of inputTokens) if (offTokens.has(t)) overlap++;
    const conf = inputTokens.size > 0 ? overlap / inputTokens.size : 0;
    if (conf < 0.5) continue;
    // Prefer Indian-market products
    const isIndia = (p.countries_tags ?? []).some(t => /india/i.test(t));
    const adjusted = conf + (isIndia ? 0.05 : 0);
    if (!best || adjusted > best.confidence) {
      best = { off: p, confidence: adjusted, match_type: brand ? "name_brand" : "name_only" };
    }
  }
  return best && best.confidence >= 0.6 ? best : null;
}

/** Try barcode first, fall back to name+brand search. */
export async function offLookup(opts: {
  barcode?: string | null;
  name: string;
  brand?: string | null;
  signal?: AbortSignal;
}): Promise<OffMatch | null> {
  if (opts.barcode) {
    const byCode = await offLookupByBarcode(opts.barcode, opts.signal);
    if (byCode) return byCode;
  }
  return offSearchByName(opts.name, opts.brand ?? null, opts.signal);
}

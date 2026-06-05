import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppleRawOcrProduct } from "@/lib/ocr/apple-raw";

export const APPLE_OCR_PRODUCT_DIR = resolve(process.cwd(), "data/cache/apple-ocr-raw/products");

export function safeSkuFileName(sku: string): string {
  return sku.replace(/[^\w.-]/g, "_");
}

function parseAppleRawFromPayload(payload: unknown): AppleRawOcrProduct | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as { apple_ocr_raw?: unknown }).apple_ocr_raw;
  if (!raw || typeof raw !== "object") return null;
  const product = raw as AppleRawOcrProduct;
  if (!Array.isArray(product.images) || typeof product.combined_text !== "string") return null;
  return product;
}

/** Load lossless Apple OCR for one SKU from local cache or Supabase `ocr_payload.apple_ocr_raw`. */
export async function loadAppleRawOcrForSku(
  sku: string,
  dbCache?: Map<string, AppleRawOcrProduct>,
): Promise<{ raw: AppleRawOcrProduct; path: string; source: "local" | "db" } | null> {
  const path = resolve(APPLE_OCR_PRODUCT_DIR, `${safeSkuFileName(sku)}.json`);
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      apple_ocr_raw?: AppleRawOcrProduct;
    };
    if (parsed.apple_ocr_raw) {
      return { raw: parsed.apple_ocr_raw, path, source: "local" };
    }
  } catch {
    if (!existsSync(path)) {
      // fall through to DB
    }
  }

  const fromDb = dbCache?.get(sku);
  if (fromDb) {
    return { raw: fromDb, path: `db:ocr_payload.apple_ocr_raw`, source: "db" };
  }
  return null;
}

/** Batch-load `apple_ocr_raw` from products for DeepSeek when local JSON is missing. */
export async function loadAppleRawOcrFromDb(
  supabase: SupabaseClient,
  skus: string[],
): Promise<Map<string, AppleRawOcrProduct>> {
  const out = new Map<string, AppleRawOcrProduct>();
  const chunkSize = 80;
  for (let i = 0; i < skus.length; i += chunkSize) {
    const chunk = skus.filter(Boolean).slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from("products")
      .select("zepto_sku, ocr_payload")
      .in("zepto_sku", chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const sku = row.zepto_sku as string | null;
      if (!sku) continue;
      const raw = parseAppleRawFromPayload(row.ocr_payload);
      if (raw) out.set(sku, raw);
    }
  }
  return out;
}

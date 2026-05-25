/**
 * Image-bytes-keyed OCR cache.
 *
 * The cache key is SHA-256 of the raw image bytes, NOT the URL. Reason:
 * Blinkit serves the same product image from multiple CDN paths (different
 * `width=` query strings, sometimes `_v2` suffixes). Two URLs → same bytes
 * → one cache hit. Also means re-OCR cost across products is amortised:
 * a 200g and 500g variant of the same SKU usually share back-label imagery.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OcrPayload } from "./types";

export interface CachedOcr {
  image_sha256: string;
  image_url: string;
  backend: string;
  model: string | null;
  payload: OcrPayload;
  confidence: number;
  created_at: string;
}

export async function readCache(
  supabase: SupabaseClient,
  sha: string,
): Promise<CachedOcr | null> {
  const { data, error } = await supabase
    .from("image_ocr_cache")
    .select("*")
    .eq("image_sha256", sha)
    .maybeSingle();
  if (error) {
    console.warn("[ocr/cache] read failed:", error.message);
    return null;
  }
  return (data as CachedOcr) ?? null;
}

export async function writeCache(
  supabase: SupabaseClient,
  args: {
    sha: string;
    imageUrl: string;
    payload: OcrPayload;
  },
): Promise<void> {
  const { error } = await supabase.from("image_ocr_cache").upsert(
    {
      image_sha256: args.sha,
      image_url: args.imageUrl,
      backend: args.payload.backend,
      model: args.payload.model ?? null,
      payload: args.payload,
      confidence: args.payload.confidence.overall,
      flags: {
        has_ingredients: args.payload.confidence.has_ingredients,
        has_nutrition_table: args.payload.confidence.has_nutrition_table,
      },
    },
    { onConflict: "image_sha256" },
  );
  if (error) console.warn("[ocr/cache] write failed:", error.message);
}

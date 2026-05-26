import { createHash } from "node:crypto";

/** SHA-256 over raw bytes. Used as the cache key for OCR results — keying on
 *  bytes (not URL) means CDN re-hashes or proxied URLs don't fragment the
 *  cache, and two products with the same back-label dedupe automatically. */
export function sha256(bytes: ArrayBuffer | Uint8Array | Buffer): string {
  const h = createHash("sha256");
  h.update(bytes instanceof ArrayBuffer ? Buffer.from(bytes) : bytes);
  return h.digest("hex");
}

/** Stable cache key when only the image URL is known (before download). */
export function hashImageUrl(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex");
}

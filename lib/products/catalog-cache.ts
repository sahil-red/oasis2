import { getAllCatalogProducts } from "@/lib/products/queries";

/**
 * Full catalog for client search + insights. Not wrapped in unstable_cache
 * because the payload exceeds Vercel's 2MB data cache limit (~2.2k products).
 * Rely on CDN / route cache headers instead.
 */
export async function getCachedCatalog() {
  return getAllCatalogProducts({ onlyWithDetail: true });
}

export async function getCachedScoredCatalog() {
  return getAllCatalogProducts({ onlyWithDetail: true, onlyScored: true });
}

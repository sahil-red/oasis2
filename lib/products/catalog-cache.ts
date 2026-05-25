import { unstable_cache } from "next/cache";
import { getAllCatalogProducts } from "@/lib/products/queries";

/** Cached catalog for search / insights (revalidates every 2 min). */
export const getCachedCatalog = unstable_cache(
  async () => getAllCatalogProducts({ onlyWithDetail: true }),
  ["oasis-catalog-v4"],
  { revalidate: 120 },
);

export const getCachedScoredCatalog = unstable_cache(
  async () => getAllCatalogProducts({ onlyWithDetail: true, onlyScored: true }),
  ["oasis-catalog-scored-v2"],
  { revalidate: 120 },
);

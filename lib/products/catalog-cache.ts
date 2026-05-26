import { unstable_cache } from "next/cache";
import {
  getCatalogMeta,
  getScoredProductsForInsights,
  type CatalogMeta,
} from "@/lib/products/queries";

export async function getCachedCatalogMeta(category?: string): Promise<CatalogMeta> {
  if (category) {
    return unstable_cache(() => getCatalogMeta(category), ["catalog-meta", category], {
      revalidate: 300,
    })();
  }
  return unstable_cache(() => getCatalogMeta(), ["catalog-meta"], {
    revalidate: 300,
  })();
}

export async function getCachedScoredCatalogForInsights() {
  return unstable_cache(
    () => getScoredProductsForInsights(),
    ["catalog-insights-scored"],
    { revalidate: 300 },
  )();
}

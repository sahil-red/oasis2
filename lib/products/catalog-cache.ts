import { unstable_cache } from "next/cache";
import { dietFromParam } from "@/lib/diet/types";
import { goalFromParam } from "@/lib/goals/types";
import { sortFromParam } from "@/lib/products/catalog-sort";
import {
  getCatalogMeta,
  getScoredProductsForInsights,
  searchCatalogGrid,
  type CatalogMeta,
  type CatalogSearchResult,
} from "@/lib/products/queries";
import type { Grade } from "@/lib/supabase/types";

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

function parseGrade(raw: string | undefined): Grade | "" {
  const g = (raw ?? "").toUpperCase();
  return g === "A" || g === "B" || g === "C" || g === "D" ? (g as Grade) : "";
}

export type CatalogSearchParams = {
  q?: string;
  category?: string;
  subcategory?: string;
  usecase?: string;
  brand?: string;
  scored?: string;
  min?: string;
  maxprice?: string;
  grade?: string;
  sort?: string;
  goal?: string;
  diet?: string;
  page?: number;
  limit?: number;
};

export async function getCachedCatalogSearch(
  params: CatalogSearchParams,
): Promise<CatalogSearchResult> {
  const goal = goalFromParam(params.goal ?? undefined);
  const diet = dietFromParam(params.diet ?? undefined);
  const minRaw = params.min;
  const maxRaw = params.maxprice;
  const page = params.page ?? 1;
  const limit = params.limit ?? 96;

  const cacheKey = JSON.stringify({
    q: params.q ?? "",
    category: params.category ?? "",
    subcategory: params.subcategory ?? "",
    usecase: params.usecase ?? "",
    brand: params.brand ?? "",
    scored: params.scored ?? "",
    min: minRaw ?? "",
    maxprice: maxRaw ?? "",
    grade: params.grade ?? "",
    sort: params.sort ?? "",
    goal,
    diet,
    page,
    limit,
  });

  return unstable_cache(
    () =>
      searchCatalogGrid({
        q: params.q,
        category: params.category,
        subcategory: params.subcategory,
        usecase: params.usecase,
        brand: params.brand,
        page,
        limit,
        onlyScored: params.scored === "1",
        minScore: minRaw ? Number(minRaw) : 0,
        maxPrice: maxRaw ? Number(maxRaw) : 0,
        grade: parseGrade(params.grade),
        sort: sortFromParam(params.sort ?? undefined),
        goal,
        diet,
      }),
    ["catalog-search", cacheKey],
    { revalidate: 300 },
  )();
}

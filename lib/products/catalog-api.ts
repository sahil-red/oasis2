import type { CatalogFilters, CatalogGridItem, CatalogSearchResult } from "@/lib/products/queries";

export type CatalogMetaResponse = {
  stats: { visible: number; scored: number; zepto: number };
  filters: CatalogFilters;
};

export async function fetchCatalogMeta(category?: string): Promise<CatalogMetaResponse> {
  const params = category ? `?category=${encodeURIComponent(category)}` : "";
  const res = await fetch(`/api/catalog/meta${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<CatalogMetaResponse>;
}

export async function fetchCatalogSearch(
  params: Record<string, string | number | boolean | undefined>,
): Promise<CatalogSearchResult> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "" || v === false) continue;
    sp.set(k, String(v));
  }
  const res = await fetch(`/api/catalog/search?${sp.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<CatalogSearchResult>;
}

export type { CatalogGridItem, CatalogSearchResult };

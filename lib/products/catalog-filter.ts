import type { CatalogFilters, ProductListItem } from "@/lib/products/queries";

export type CatalogFilterState = {
  q: string;
  category: string;
  subcategory: string;
  brand: string;
  onlyScored: boolean;
};

export function filterCatalogProducts(
  products: ProductListItem[],
  state: CatalogFilterState,
): ProductListItem[] {
  const q = state.q.trim().toLowerCase();

  return products.filter((p) => {
    if (state.onlyScored && !p.core_scores) return false;
    if (state.category && p.category !== state.category) return false;
    if (state.subcategory && p.subcategory !== state.subcategory) return false;
    if (state.brand && p.brand !== state.brand) return false;
    if (!q) return true;
    const hay = [p.name, p.brand, p.category, p.subcategory]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function buildFilterOptions(
  products: ProductListItem[],
  category?: string,
): CatalogFilters {
  const pool = category ? products.filter((p) => p.category === category) : products;
  const categories = new Set<string>();
  const subcategories = new Set<string>();
  const brands = new Set<string>();

  for (const p of products) {
    if (p.category) categories.add(p.category);
  }
  for (const p of pool) {
    if (p.subcategory) subcategories.add(p.subcategory);
    if (p.brand) brands.add(p.brand);
  }

  const sort = (a: string, b: string) => a.localeCompare(b);
  return {
    categories: [...categories].sort(sort),
    subcategories: [...subcategories].sort(sort),
    brands: [...brands].sort(sort),
  };
}

export function parseCatalogParams(params: {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  scored?: string;
}): CatalogFilterState {
  return {
    q: params.q?.trim() ?? "",
    category: params.category ?? "",
    subcategory: params.subcategory ?? "",
    brand: params.brand ?? "",
    onlyScored: params.scored === "1",
  };
}

export function catalogParamsToSearch(state: CatalogFilterState): string {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.category) p.set("category", state.category);
  if (state.subcategory) p.set("subcategory", state.subcategory);
  if (state.brand) p.set("brand", state.brand);
  if (state.onlyScored) p.set("scored", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

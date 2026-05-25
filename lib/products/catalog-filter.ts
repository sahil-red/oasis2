import {
  productAisle,
  productMatchesAisle,
  productMatchesShelf,
  productShelf,
} from "@/lib/products/catalog-meta";
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
    if (!productMatchesAisle(p, state.category)) return false;
    if (!productMatchesShelf(p, state.subcategory)) return false;
    if (state.brand && p.brand !== state.brand) return false;
    if (!q) return true;
    const shelf = productShelf(p);
    const hay = [p.name, p.brand, productAisle(p), shelf]
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
  const pool = category
    ? products.filter((p) => productMatchesAisle(p, category))
    : products;
  const categories = new Set<string>();
  const subcategories = new Set<string>();
  const brands = new Set<string>();

  for (const p of products) {
    const aisle = productAisle(p);
    if (aisle) categories.add(aisle);
  }
  for (const p of pool) {
    const shelf = productShelf(p);
    if (shelf) subcategories.add(shelf);
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

export function catalogParamsToSearch(
  state: CatalogFilterState,
  goal?: string,
): string {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.category) p.set("category", state.category);
  if (state.subcategory) p.set("subcategory", state.subcategory);
  if (state.brand) p.set("brand", state.brand);
  if (state.onlyScored) p.set("scored", "1");
  if (goal && goal !== "balanced") p.set("goal", goal);
  const s = p.toString();
  return s ? `?${s}` : "";
}

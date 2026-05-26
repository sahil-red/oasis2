import { isDietCompatible } from "@/lib/diet/match";
import type { DietMode } from "@/lib/diet/types";
import { dietFromParam } from "@/lib/diet/types";
import { goalFromParam } from "@/lib/goals/types";
import {
  productAisle,
  productMatchesAisle,
  productMatchesShelf,
  productMatchesUsecase,
  productShelf,
  productUsecase,
} from "@/lib/products/catalog-meta";
import type { CatalogFilters, ProductListItem } from "@/lib/products/queries";

export type CatalogFilterState = {
  q: string;
  category: string;
  subcategory: string;
  usecase: string;
  brand: string;
  onlyScored: boolean;
};

export function filterCatalogProducts(
  products: ProductListItem[],
  state: CatalogFilterState,
  diet: DietMode = "any",
): ProductListItem[] {
  const q = state.q.trim().toLowerCase();

  return products.filter((p) => {
    if (state.onlyScored && !p.core_scores) return false;
    if (!productMatchesAisle(p, state.category)) return false;
    if (!productMatchesShelf(p, state.subcategory)) return false;
    if (!productMatchesUsecase(p, state.usecase)) return false;
    if (state.brand && p.brand !== state.brand) return false;
    if (diet !== "any" && !isDietCompatible(diet, p).ok) return false;
    if (!q) return true;
    const shelf = productShelf(p);
    const usecase = productUsecase(p);
    const hay = [p.name, p.brand, productAisle(p), shelf, usecase]
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
  const usecases = new Set<string>();
  const brands = new Set<string>();

  for (const p of products) {
    const aisle = productAisle(p);
    if (aisle) categories.add(aisle);
  }
  for (const p of pool) {
    const shelf = productShelf(p);
    if (shelf) subcategories.add(shelf);
    const usecase = productUsecase(p);
    if (usecase) usecases.add(usecase);
    if (p.brand) brands.add(p.brand);
  }

  const sort = (a: string, b: string) => a.localeCompare(b);
  return {
    categories: [...categories].sort(sort),
    subcategories: [...subcategories].sort(sort),
    usecases: [...usecases].sort(sort),
    brands: [...brands].sort(sort),
  };
}

export function parseCatalogParams(params: {
  q?: string;
  category?: string;
  subcategory?: string;
  usecase?: string;
  brand?: string;
  scored?: string;
}): CatalogFilterState {
  return {
    q: params.q?.trim() ?? "",
    category: params.category ?? "",
    subcategory: params.subcategory ?? "",
    usecase: params.usecase ?? "",
    brand: params.brand ?? "",
    onlyScored: params.scored === "1",
  };
}

export function catalogParamsToSearch(
  state: CatalogFilterState,
  goal?: string,
  opts?: { diet?: DietMode },
): string {
  const p = new URLSearchParams();
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.category) p.set("category", state.category);
  if (state.subcategory) p.set("subcategory", state.subcategory);
  if (state.usecase) p.set("usecase", state.usecase);
  if (state.brand) p.set("brand", state.brand);
  if (state.onlyScored) p.set("scored", "1");
  if (goal && goal !== "balanced") p.set("goal", goal);
  if (opts?.diet && opts.diet !== "any") p.set("diet", opts.diet);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Preserve catalog filters on PDP links so back navigation restores context. */
export function catalogContextQuery(
  state: CatalogFilterState,
  goal?: string,
  opts?: { diet?: DietMode },
): string {
  return catalogParamsToSearch(state, goal, opts);
}

/** Rebuild /search URL from PDP query params (pass-through from catalog → product links). */
export function catalogReturnHref(params: {
  q?: string;
  category?: string;
  subcategory?: string;
  usecase?: string;
  brand?: string;
  scored?: string;
  goal?: string;
  diet?: string;
}): string {
  const state = parseCatalogParams(params);
  const goal = params.goal ? goalFromParam(params.goal) : "balanced";
  const diet = params.diet ? dietFromParam(params.diet) : "any";
  return `/search${catalogParamsToSearch(state, goal, { diet })}`;
}

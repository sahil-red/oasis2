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
import { sortFromParam, type CatalogSort } from "@/lib/products/catalog-sort";
import type { CatalogFilters, ProductListItem } from "@/lib/products/queries";
import type { Grade } from "@/lib/supabase/types";

export type CatalogFilterState = {
  q: string;
  category: string;
  subcategory: string;
  usecase: string;
  brand: string;
  onlyScored: boolean;
  minScore: number;
  maxPrice: number;
  grade: Grade | "";
  sort: CatalogSort;
};

export function filterCatalogProducts(
  products: ProductListItem[],
  state: CatalogFilterState,
  diet: DietMode = "any",
): ProductListItem[] {
  const q = state.q.trim().toLowerCase();

  return products.filter((p) => {
    if (state.onlyScored && !p.core_scores) return false;
    if (state.minScore > 0) {
      const s = p.core_scores?.score;
      if (s == null || s < state.minScore) return false;
    }
    if (state.maxPrice > 0) {
      const price = p.price_inr ?? p.mrp_inr;
      if (price == null || price > state.maxPrice) return false;
    }
    if (state.grade && p.core_scores?.grade !== state.grade) return false;
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
  min?: string;
  maxprice?: string;
  grade?: string;
  sort?: string;
}): CatalogFilterState {
  const minRaw = params.min ? Number(params.min) : 0;
  const maxRaw = params.maxprice ? Number(params.maxprice) : 0;
  const gradeRaw = (params.grade ?? "").toUpperCase();
  const grade =
    gradeRaw === "A" || gradeRaw === "B" || gradeRaw === "C" || gradeRaw === "D"
      ? (gradeRaw as Grade)
      : "";

  return {
    q: params.q?.trim() ?? "",
    category: params.category ?? "",
    subcategory: params.subcategory ?? "",
    usecase: params.usecase ?? "",
    brand: params.brand ?? "",
    onlyScored: params.scored === "1",
    minScore: Number.isFinite(minRaw) && minRaw > 0 ? minRaw : 0,
    maxPrice: Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 0,
    grade,
    sort: sortFromParam(params.sort),
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
  if (state.minScore > 0) p.set("min", String(state.minScore));
  if (state.maxPrice > 0) p.set("maxprice", String(state.maxPrice));
  if (state.grade) p.set("grade", state.grade);
  if (state.sort !== "score-desc") p.set("sort", state.sort);
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
  min?: string;
  maxprice?: string;
  grade?: string;
  sort?: string;
  goal?: string;
  diet?: string;
}): string {
  const state = parseCatalogParams(params);
  const goal = params.goal ? goalFromParam(params.goal) : "balanced";
  const diet = params.diet ? dietFromParam(params.diet) : "any";
  return `/search${catalogParamsToSearch(state, goal, { diet })}`;
}

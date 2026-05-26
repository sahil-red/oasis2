import type { ProductListItem } from "@/lib/products/queries";

export type CatalogSort =
  | "score-desc"
  | "score-asc"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "protein-desc";

export const CATALOG_SORT_OPTIONS: { id: CatalogSort; label: string }[] = [
  { id: "score-desc", label: "Score (high → low)" },
  { id: "score-asc", label: "Score (low → high)" },
  { id: "price-asc", label: "Price (low → high)" },
  { id: "price-desc", label: "Price (high → low)" },
  { id: "protein-desc", label: "Protein (high → low)" },
  { id: "name-asc", label: "Name (A → Z)" },
];

export function sortFromParam(raw: string | null | undefined): CatalogSort {
  const id = (raw ?? "score-desc").toLowerCase();
  return CATALOG_SORT_OPTIONS.some((o) => o.id === id) ? (id as CatalogSort) : "score-desc";
}

export function compareCatalogItems(a: ProductListItem, b: ProductListItem, sort: CatalogSort): number {
  switch (sort) {
    case "score-asc":
      return (a.core_scores?.score ?? 101) - (b.core_scores?.score ?? 101);
    case "price-asc":
      return (a.price_inr ?? Number.MAX_SAFE_INTEGER) - (b.price_inr ?? Number.MAX_SAFE_INTEGER);
    case "price-desc":
      return (b.price_inr ?? -1) - (a.price_inr ?? -1);
    case "name-asc":
      return a.name.localeCompare(b.name);
    case "protein-desc":
      return (
        (b.nutrition?.protein_g_100g ?? -1) - (a.nutrition?.protein_g_100g ?? -1) ||
        (b.core_scores?.score ?? -1) - (a.core_scores?.score ?? -1)
      );
    case "score-desc":
    default:
      return (b.core_scores?.score ?? -1) - (a.core_scores?.score ?? -1);
  }
}

export function sortCatalogItems(items: ProductListItem[], sort: CatalogSort): ProductListItem[] {
  if (sort === "score-desc") return items;
  return [...items].sort((a, b) => compareCatalogItems(a, b, sort));
}

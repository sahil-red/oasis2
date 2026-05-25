import type { ProductListItem } from "@/lib/products/queries";

/** Blinkit L1 aisle on listing scrape (e.g. "Snacks & Munchies"). */
export function productAisle(p: Pick<ProductListItem, "category" | "super_category">): string | null {
  return p.category ?? p.super_category ?? null;
}

/** Finer shelf label: DB subcategory, else PDP attribute (Type, etc.). */
export function productShelf(
  p: Pick<ProductListItem, "subcategory" | "attributes">,
): string | null {
  if (p.subcategory?.trim()) return p.subcategory.trim();
  const attrs = p.attributes;
  if (!attrs || typeof attrs !== "object") return null;
  for (const key of ["Type", "type", "Subcategory", "Category", "Product Type"]) {
    const v = attrs[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function productMatchesAisle(
  p: Pick<ProductListItem, "category" | "super_category">,
  aisle: string,
): boolean {
  if (!aisle) return true;
  return productAisle(p) === aisle;
}

export function productMatchesShelf(
  p: Pick<ProductListItem, "subcategory" | "attributes">,
  shelf: string,
): boolean {
  if (!shelf) return true;
  return productShelf(p) === shelf;
}

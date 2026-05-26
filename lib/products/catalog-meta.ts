import type { ProductListItem } from "@/lib/products/queries";

/** L1 aisle from CSV category_name. */
export function productAisle(p: Pick<ProductListItem, "category" | "super_category">): string | null {
  return p.category ?? p.super_category ?? null;
}

/** L2 type from CSV subcategory_name. */
export function productShelf(
  p: Pick<ProductListItem, "subcategory" | "attributes">,
): string | null {
  if (p.subcategory?.trim()) return p.subcategory.trim();
  return null;
}

/** L3 use-case from CSV l3_category_name (stored in attributes when column absent). */
export function productUsecase(
  p: Pick<ProductListItem, "l3_category" | "attributes">,
): string | null {
  if (p.l3_category?.trim()) return p.l3_category.trim();
  const v = p.attributes?.["L3 Category"];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function productMatchesUsecase(
  p: Pick<ProductListItem, "l3_category" | "attributes">,
  usecase: string,
): boolean {
  if (!usecase) return true;
  return productUsecase(p) === usecase;
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

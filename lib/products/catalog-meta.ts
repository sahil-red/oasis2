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

/** Products whose names clearly belong elsewhere (bad listing category on Blinkit). */
const AISLE_MISMATCH: Record<string, RegExp> = {
  "Cold Drinks & Juices":
    /\b(ketchup|sauce|masala|atta|dal|rice|chicken|meat|paneer|bread|biscuit|cookie|chips?|namkeen)\b/i,
  "Fruits & Vegetables":
    /\b(ketchup|sauce|masala|atta|dal|rice|chicken|biscuit|cookie|chocolate|drink|juice|soda|cola)\b/i,
  "Snacks & Munchies":
    /\b(ketchup|masala|atta|dal|rice|chicken|paneer|milk|curd|yogurt|juice|soda)\b/i,
};

export function productMatchesAisle(
  p: Pick<ProductListItem, "category" | "super_category" | "name">,
  aisle: string,
): boolean {
  if (!aisle) return true;
  const a = productAisle(p);
  if (!a) return false;
  if (a !== aisle) return false;
  const block = AISLE_MISMATCH[aisle];
  if (block && block.test(p.name)) return false;
  return true;
}

export function productMatchesShelf(
  p: Pick<ProductListItem, "subcategory" | "attributes">,
  shelf: string,
): boolean {
  if (!shelf) return true;
  return productShelf(p) === shelf;
}

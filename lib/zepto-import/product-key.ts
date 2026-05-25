export type ZeptoImportIdentity = {
  brand: string;
  name: string;
  pack_size: string;
  l3_category?: string | null;
  subcategory?: string | null;
};

export function slugifyPart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

export function buildProductSlugFromVariant(
  row: ZeptoImportIdentity,
  variantId: string,
): string {
  const brand = slugifyPart(row.brand || "brand");
  const name = slugifyPart(row.name || "product");
  return `zepto-${brand}-${name}-${variantId.slice(0, 8)}`;
}

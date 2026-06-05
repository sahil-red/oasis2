const ZEPTO_ORIGIN = "https://www.zepto.com";

export type ZeptoBuyProduct = {
  platform?: string | null;
  product_url?: string | null;
  zepto_sku?: string | null;
  name?: string | null;
};

/** Zepto PDP link for "Buy on Zepto" — stored URL first, else build from SKU + name. */
export function resolveZeptoBuyUrl(product: ZeptoBuyProduct): string | null {
  if (product.platform && product.platform !== "zepto") return null;

  const stored = product.product_url?.trim();
  if (stored && stored.startsWith(ZEPTO_ORIGIN)) return stored;

  const sku = product.zepto_sku?.trim();
  if (!sku) return null;

  const slug = slugifyZeptoProductPath(product.name ?? "");
  return `${ZEPTO_ORIGIN}/pn/${slug}/pvid/${sku}`;
}

function slugifyZeptoProductPath(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "product";
}

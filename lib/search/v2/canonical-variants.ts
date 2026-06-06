/**
 * §8 canonical cluster siblings — expand on click.
 */
import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

export function getCanonicalSiblings(
  index: ProductSearchIndexRow[],
  productId: string,
): ProductSearchIndexRow[] {
  const row = index.find((r) => r.product_id === productId);
  if (!row) return [];

  const canon = row.canonical_product_id ?? row.product_id;
  return index
    .filter((r) => (r.canonical_product_id ?? r.product_id) === canon)
    .sort((a, b) => b.data_quality_score - a.data_quality_score);
}

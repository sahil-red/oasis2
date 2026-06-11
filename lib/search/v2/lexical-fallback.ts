import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

/** §9 degradation — lexical membership when vectors are unavailable */
export function lexicalBlob(row: ProductSearchIndexRow): string {
  return [row.primary_type ?? "", row.name, row.category, row.subcategory, row.l3_category]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function lexicalTypeMatch(row: ProductSearchIndexRow, primaryType: string): boolean {
  const blob = lexicalBlob(row);
  const tokens = primaryType.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  if (!tokens.length) return true;
  return tokens.every((t) => blob.includes(t));
}

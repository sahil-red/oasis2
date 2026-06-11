import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

/** Distinct brands/types from enriched index — data for fast-path, not a hand lexicon (§6). */
export type IndexCatalogMeta = {
  brands: Set<string>;
  primaryTypes: Set<string>;
  flavours: Set<string>;
};

export function buildIndexCatalogMeta(index: ProductSearchIndexRow[]): IndexCatalogMeta {
  const brands = new Set<string>();
  const primaryTypes = new Set<string>();
  const flavours = new Set<string>();
  for (const row of index) {
    const b = row.brand?.toLowerCase().trim();
    if (b && b.length >= 2) brands.add(b);
    const t = row.primary_type?.toLowerCase().trim();
    if (t && t.length >= 2) primaryTypes.add(t);
    if (Array.isArray(row.flavours)) {
      for (const f of row.flavours) {
        const fl = f?.toLowerCase().trim();
        if (fl && fl.length >= 2) flavours.add(fl);
      }
    }
  }
  return { brands, primaryTypes, flavours };
}

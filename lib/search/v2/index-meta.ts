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
    const raw = row.brand?.toLowerCase().replace(/['']/g, "").trim();
    const orig = row.brand?.toLowerCase();
    if (raw && raw.length >= 2) {
      brands.add(raw);
      // Also add variant without known platform suffixes ("open secret pf" → "open secret")
      const cleaned = raw.replace(/\s+(?:pf|pp|dl)$/i, "").trim();
      if (cleaned && cleaned.length >= 2 && cleaned !== raw) brands.add(cleaned);
      // Also add variant without trailing 's/possession marker, but only
      // when the original brand had an apostrophe (e.g. "Haldiram's" → "haldiram")
      if (orig && /['']s\b/i.test(orig)) {
        const noPossessive = raw.replace(/s$/, "").trim();
        if (noPossessive && noPossessive.length >= 2 && noPossessive !== raw) brands.add(noPossessive);
      }
    }
    const t = row.primary_type?.toLowerCase().replace(/['']/g, "").trim();
    if (t && t.length >= 2) primaryTypes.add(t);
    if (Array.isArray(row.flavours)) {
      for (const f of row.flavours) {
        const fl = f?.toLowerCase().replace(/['']/g, "").trim();
        if (fl && fl.length >= 2) flavours.add(fl);
      }
    }
  }
  return { brands, primaryTypes, flavours };
}

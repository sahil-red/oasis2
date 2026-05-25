import type { SupabaseClient } from "@supabase/supabase-js";

export type CatalogDbSchema = {
  hasProductKey: boolean;
  hasL3Category: boolean;
  hasDataSource: boolean;
};

let cached: CatalogDbSchema | null = null;

/** Probe optional migration columns (0005) — safe when not yet applied. */
export async function detectCatalogDbSchema(
  supabase: SupabaseClient,
): Promise<CatalogDbSchema> {
  if (cached) return cached;
  const probes: Array<[keyof CatalogDbSchema, string]> = [
    ["hasProductKey", "product_key"],
    ["hasL3Category", "l3_category"],
    ["hasDataSource", "data_source"],
  ];
  const out: CatalogDbSchema = {
    hasProductKey: false,
    hasL3Category: false,
    hasDataSource: false,
  };
  for (const [key, col] of probes) {
    const { error } = await supabase.from("products").select(col).limit(1);
    out[key] = !error;
  }
  cached = out;
  return out;
}

export function l3FromRow(row: {
  l3_category?: string | null;
  attributes?: Record<string, string> | null;
  subcategory?: string | null;
}): string | null {
  return (
    row.l3_category?.trim() ||
    row.attributes?.["L3 Category"]?.trim() ||
    row.subcategory?.trim() ||
    null
  );
}

import { createHash } from "node:crypto";

/** Hash of raw catalog fields — skip re-enrichment when unchanged (§16.1). */
export function computeProductSourceHash(opts: {
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  l3_category: string | null;
  nutrition: unknown;
  ingredients_raw: string | null;
  attributes: Record<string, string> | null;
}): string {
  const payload = JSON.stringify({
    name: opts.name?.trim(),
    brand: opts.brand?.trim() ?? null,
    category: opts.category?.trim() ?? null,
    subcategory: opts.subcategory?.trim() ?? null,
    l3_category: opts.l3_category?.trim() ?? null,
    nutrition: opts.nutrition,
    ingredients_raw: opts.ingredients_raw?.trim() ?? null,
    attributes: opts.attributes,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 20);
}

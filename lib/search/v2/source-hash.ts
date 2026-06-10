import { createHash } from "node:crypto";

/** Deterministic JSON stringify — sorts keys so JSONB ordering doesn't break hashes. */
function stableJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableJson).join(",") + "]";
  return "{" + Object.keys(obj as Record<string, unknown>).sort().map(k =>
    JSON.stringify(k) + ":" + stableJson((obj as Record<string, unknown>)[k])
  ).join(",") + "}";
}

/** Hash of raw catalog fields — skip re-enrichment when unchanged (§16.1). */
export function computeProductSourceHash(opts: {
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  l3_category: string | null;
  net_weight?: string | null;
  nutrition: unknown;
  ingredients_raw: string | null;
  attributes: Record<string, string> | null;
}): string {
  const payload = stableJson({
    name: opts.name?.trim(),
    brand: opts.brand?.trim() ?? null,
    category: opts.category?.trim() ?? null,
    subcategory: opts.subcategory?.trim() ?? null,
    l3_category: opts.l3_category?.trim() ?? null,
    net_weight: opts.net_weight?.trim() ?? null,
    nutrition: opts.nutrition,
    ingredients_raw: opts.ingredients_raw?.trim() ?? null,
    attributes: opts.attributes,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 20);
}

/** Mirror of lib/search/catalog-intent-signals.ts for client intent routing. */

export type IntentSignalOpts = {
  brands?: Iterable<string>;
  subcategories?: Iterable<string>;
  productTypes?: Set<string>;
};

export const CURATED_PRODUCT_TYPES = [
  "namkeen", "biscuit", "biscuits", "cookie", "cookies", "oats", "oat", "milk", "paneer",
  "curd", "yogurt", "ghee", "butter", "cheese", "bread", "rice", "atta", "flour", "oil",
  "juice", "juices", "chips", "snack", "snacks", "chocolate", "protein", "powder", "masala",
  "tea", "coffee", "honey", "jam", "pickle", "noodles", "pasta", "cereal", "muesli", "granola",
  "bar", "bars", "drink", "drinks", "soda", "cola", "water", "lassi", "buttermilk", "tofu",
  "soya", "soy",
] as const;

const STOP = new Set(["and", "the", "with", "for", "fresh", "frozen", "organic", "natural", "premium"]);

export function normalizeBrandSet(brands?: Iterable<string>): Set<string> | null {
  if (!brands) return null;
  const out = new Set<string>();
  for (const b of brands) {
    const t = b.toLowerCase().trim();
    if (t.length >= 2) out.add(t);
    for (const part of t.split(/[^a-z0-9&'.-]+/i)) {
      if (part.length >= 3) out.add(part);
    }
  }
  return out.size ? out : null;
}

export function buildProductTypeSet(subcategories?: Iterable<string>): Set<string> {
  const out = new Set<string>(CURATED_PRODUCT_TYPES);
  for (const raw of subcategories ?? []) {
    for (const part of raw.toLowerCase().split(/[^a-z0-9]+/i)) {
      const t = part.trim();
      if (t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t)) out.add(t);
    }
  }
  return out;
}

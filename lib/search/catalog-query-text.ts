/** Quality modifiers in the search box — not part of the product name ILIKE term. */
const QUALITY_MODIFIERS = new Set([
  "healthy",
  "healthiest",
  "healthier",
  "organic",
  "natural",
  "nutritious",
  "wholesome",
  "clean",
  "cleaner",
  "cleanest",
  "best",
  "good",
  "better",
]);

/**
 * Catalog SQL search uses ILIKE on name/brand. Multi-word queries like "healthy noodles"
 * must not require the exact phrase — strip quality words and keep product tokens.
 */
export function catalogSearchIlikeTerm(raw: string): string | null {
  const tokens = raw
    .toLowerCase()
    .trim()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2);
  if (!tokens.length) return null;

  const productish = tokens.filter((t) => !QUALITY_MODIFIERS.has(t));
  const use = productish.length ? productish : tokens;
  const term = use.join(" ").replace(/[%_]/g, "").trim();
  return term || null;
}

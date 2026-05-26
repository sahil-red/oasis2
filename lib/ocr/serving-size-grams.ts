/** Parse a serving-size string into grams (or ml treated as ~1g/ml). Returns null if unknown. */
export function parseServingSizeGrams(servingSize: string | null | undefined): number | null {
  if (!servingSize?.trim()) return null;
  const s = servingSize.trim().toLowerCase();

  const combined = s.match(
    /(\d+(?:\.\d+)?)\s*(?:g|gm|gram|grams|ml|l|kg)\b/i,
  );
  if (!combined) {
    const numOnly = s.match(/^(\d+(?:\.\d+)?)\s*$/);
    if (numOnly) {
      const n = Number(numOnly[1]);
      return Number.isFinite(n) && n > 0 && n <= 2000 ? n : null;
    }
    return null;
  }

  const n = Number(combined[1]);
  if (!Number.isFinite(n) || n <= 0) return null;

  const unit = combined[0].replace(combined[1], "").trim().toLowerCase();
  if (unit.includes("kg")) return n * 1000 <= 5000 ? n * 1000 : null;
  if (unit === "l" || unit.startsWith("l ")) return n * 1000 <= 5000 ? n * 1000 : null;
  if (unit.includes("ml")) return n <= 2000 ? n : null;
  if (unit.includes("g")) return n <= 2000 ? n : null;

  return n <= 2000 ? n : null;
}

/** Scale a per-100g nutrient to per-serving; never returns NaN. */
export function scalePer100gToServe(
  per100g: number | null | undefined,
  serveGrams: number | null,
): number | null {
  if (per100g == null || serveGrams == null) return null;
  if (!Number.isFinite(per100g) || !Number.isFinite(serveGrams) || serveGrams <= 0) {
    return null;
  }
  const scaled = per100g * (serveGrams / 100);
  if (!Number.isFinite(scaled)) return null;
  return Math.round(scaled * 100) / 100;
}

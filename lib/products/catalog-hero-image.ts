/**
 * Pick and order catalog product images so index 0 is front-of-pack, not a back label.
 *
 * Zepto / CSV rows sometimes list nutrition-back or regulatory shots first. We use URL
 * path cues (cheap, no network) and optionally deprioritize the known OCR label frame.
 */

const LABEL_URL_RE =
  /\b(nutrition(?:al)?|nfp|ingredient|composition|back[-_]?label|back[-_]?of|rear|facts|fssai|statutory|regulatory|barcode|qr[-_]?code|mrp[-_]?sticker|label[-_]?shot)\b/i;

const HERO_URL_RE =
  /\b(front[-_]?(?:of[-_]?pack|pack|shot|view)?|pack[-_]?shot|hero|main[-_]?image|primary[-_]?image|thumbnail|thumb|cover|lifestyle|product[-_]?shot)\b/i;

/** Strip query/hash so width variants dedupe. */
export function imageUrlKey(url: string): string {
  const s = url.trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    return `${u.hostname}${u.pathname}`.toLowerCase();
  } catch {
    return s.split("?")[0]?.split("#")[0]?.toLowerCase() ?? s.toLowerCase();
  }
}

export function looksLikeLabelImageUrl(url: string): boolean {
  const key = imageUrlKey(url);
  if (!key) return false;
  if (LABEL_URL_RE.test(key)) return true;
  // Zepto asset folders sometimes encode view type in path segments.
  if (/\/(back|rear|label|nutrition|nfp)\//i.test(key)) return true;
  return false;
}

export function looksLikeHeroImageUrl(url: string): boolean {
  const key = imageUrlKey(url);
  if (!key) return false;
  if (looksLikeLabelImageUrl(url)) return false;
  if (HERO_URL_RE.test(key)) return true;
  if (/\/(front|hero|main|primary|thumbnail|thumb)\//i.test(key)) return true;
  return false;
}

/** Higher score = better catalog hero (front-of-pack). */
export function scoreHeroCandidate(url: string, index: number, total: number): number {
  let score = 0;
  if (looksLikeHeroImageUrl(url)) score += 12;
  if (looksLikeLabelImageUrl(url)) score -= 14;

  // Platform convention: front → sides → back (see lib/ocr/picker.ts).
  if (index === 0) score += 4;
  else if (index === 1 && total > 2) score += 2;
  if (total > 1 && index === total - 1) score -= 5;
  if (total > 2 && index === total - 2) score -= 2;

  return score;
}

export function dedupeImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = raw?.trim();
    if (!url) continue;
    const key = imageUrlKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

export type OrderCatalogImagesOpts = {
  /** OCR back-label URL — never use as hero when another frame exists. */
  ocrImageUrl?: string | null;
};

/**
 * Reorder images: best hero first, label-like frames last, stable within ties.
 */
export function orderCatalogImageUrls(
  urls: string[],
  opts: OrderCatalogImagesOpts = {},
): string[] {
  const deduped = dedupeImageUrls(urls);
  if (deduped.length <= 1) return deduped;

  const ocrKey = opts.ocrImageUrl?.trim() ? imageUrlKey(opts.ocrImageUrl) : null;

  const indexed = deduped.map((url, index) => ({
    url,
    index,
    score: scoreHeroCandidate(url, index, deduped.length),
  }));

  for (const row of indexed) {
    if (ocrKey && imageUrlKey(row.url) === ocrKey) {
      row.score -= 20;
    }
  }

  indexed.sort((a, b) => b.score - a.score || a.index - b.index);
  return indexed.map((r) => r.url);
}

/** True when reordering would change the hero (index 0). */
export function needsHeroReorder(urls: string[], opts: OrderCatalogImagesOpts = {}): boolean {
  const deduped = dedupeImageUrls(urls);
  if (deduped.length <= 1) return false;
  const ordered = orderCatalogImageUrls(deduped, opts);
  return ordered[0] !== deduped[0];
}

export function normalizeProductImageUrls(
  urls: string[] | null | undefined,
  opts: OrderCatalogImagesOpts = {},
): string[] {
  if (!urls?.length) return [];
  return orderCatalogImageUrls(urls, opts);
}

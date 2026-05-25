/** Normalize image URL from CSV (Image_Link / image_links column). */
export function parseCsvImageUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (/^(null|none|n\/a)$/i.test(s)) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `https://cdn.zeptonow.com/${s.replace(/^\//, "")}`;
}

const MAX_CSV_IMAGES = 7;

/** Parse single URL or JSON array of URLs (preserves CSV order, up to 7). */
export function parseCsvImageUrls(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const s = raw.trim();

  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (!Array.isArray(parsed)) return fallbackSingle(s);
      const urls: string[] = [];
      for (const item of parsed) {
        if (typeof item !== "string") continue;
        const url = parseCsvImageUrl(item);
        if (url) urls.push(url);
        if (urls.length >= MAX_CSV_IMAGES) break;
      }
      return urls;
    } catch {
      return fallbackSingle(s);
    }
  }

  return fallbackSingle(s);
}

function fallbackSingle(s: string): string[] {
  const u = parseCsvImageUrl(s);
  return u ? [u] : [];
}

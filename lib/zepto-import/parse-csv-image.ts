/** Normalize image URL from CSV (Image_Link column). */
export function parseCsvImageUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  if (/^(null|none|n\/a)$/i.test(s)) return null;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return `https://cdn.zeptonow.com/${s.replace(/^\//, "")}`;
}

export function parseCsvImageUrls(raw: string | null | undefined): string[] {
  const u = parseCsvImageUrl(raw);
  return u ? [u] : [];
}

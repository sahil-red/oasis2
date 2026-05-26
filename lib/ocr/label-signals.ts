/** True when OCR text looks like a back-label (nutrition table and/or ingredients). */
export function hasLabelKeywords(text: string): boolean {
  if (!text?.trim()) return false;
  const t = text.toLowerCase();
  return (
    /nutrition(?:al)?(?:\s+information|\s+facts|\s+value)?/i.test(t) ||
    /\bingredients?\b/i.test(t) ||
    /ingredient\s*list/i.test(t)
  );
}

export function labelSignalScore(text: string): number {
  if (!text?.trim()) return 0;
  const t = text.toLowerCase();
  let s = 0;
  if (/nutrition(?:al)?/i.test(t)) s += 3;
  if (/\bingredients?\b/i.test(t)) s += 3;
  if (/per\s*100\s*g|per\s*100\s*ml/i.test(t)) s += 2;
  if (/energy|protein|carbohydrate|sodium/i.test(t)) s += 1;
  return s;
}

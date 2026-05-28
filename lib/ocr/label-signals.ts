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
  if (/nutrition(?:al)?/i.test(t)) s += 2;
  if (/\bingredients?\s*[:\-]/i.test(t)) s += 8;
  else if (/\bingredients?\b/i.test(t)) s += 2;
  if (/composition\s*[:\-]/i.test(t)) s += 6;
  if (/per\s*100\s*g|per\s*100\s*ml/i.test(t)) s += 2;
  if (/energy|protein|carbohydrate|sodium/i.test(t)) s += 1;
  const commaCount = (text.match(/,/g) ?? []).length;
  if (commaCount >= 4) s += 2;
  else if (commaCount >= 2) s += 1;
  if (!/\bingredients?\s*[:\-]/i.test(t) && /probiotic\s+dahi|creamy\s+delight/i.test(t)) {
    s -= 4;
  }
  return s;
}

export function rawTextHasIngredientsLine(text: string): boolean {
  return /\bingredients?\s*[:\-]/i.test(text) || /composition\s*[:\-]/i.test(text);
}

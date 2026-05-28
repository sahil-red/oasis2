import { formatIngredientsList } from "@/lib/ocr/format-ingredients";

/** Attention anchor: verified ingredients line from OCR (reduces FOP marketing contamination). */

const INGREDIENTS_LINE =
  /ingredients?\s*[:\-]?\s*([^\n|]+)/i;

const INGREDIENTS_BLOCK =
  /ingredients?\s*[:\-]?\s*([\s\S]*?)(?=\n\s*(?:nutrition(?:al)?\s*information|allergen|contains|may contain|best before|store|fssai|net\s*quantity|customer care|manufactured)|$)/i;

export function extractIngredientsAnchor(rawText: string): string {
  const block = rawText.match(INGREDIENTS_BLOCK);
  if (block?.[0]?.trim()) {
    const line = block[0].trim().replace(/\s+/g, " ");
    return `[VERIFIED INGREDIENTS LINE FOUND IN OCR: "${line}"]`;
  }
  const line = rawText.match(INGREDIENTS_LINE);
  if (line?.[0]?.trim()) {
    return `[VERIFIED INGREDIENTS LINE FOUND IN OCR: "${line[0].trim()}"]`;
  }
  return "";
}

/** Parsed technical ingredients line from raw OCR (no LM). */
export function extractIngredientsLineFromRaw(rawText: string): string | null {
  const block = rawText.match(INGREDIENTS_BLOCK);
  if (block?.[1]?.trim()) {
    const body = block[1].trim().replace(/\s+/g, " ");
    return formatIngredientsList(body) ?? formatIngredientsList(block[0]) ?? body;
  }
  const line = rawText.match(INGREDIENTS_LINE);
  if (line?.[1]?.trim()) {
    return formatIngredientsList(line[1]) ?? line[1].trim();
  }
  return null;
}

export function buildLmStructureUserPayload(rawText: string): string {
  const hint = extractIngredientsAnchor(rawText);
  const body =
    rawText.length > 14_000 ? `${rawText.slice(0, 14_000)}\n[truncated]` : rawText;

  return `${hint}

RAW OCR TEXT TO PARSE:
"""
${body}
"""`;
}

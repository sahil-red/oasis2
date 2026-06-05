import {
  formatIngredientsList,
  repairIngredientListText,
  splitIngredientSegments,
} from "@/lib/ocr/format-ingredients";
import type { EvidenceRef, ExtractedLabel } from "@/lib/ocr/deepseek-label-extract";
import { isMarketingIngredientList } from "@/lib/ocr/ingredients-quality";

function evidenceSnippet(evidence: EvidenceRef | null | undefined): string {
  if (!evidence?.snippet || typeof evidence.snippet !== "string") return "";
  return evidence.snippet;
}

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function alreadyListed(parts: string[], candidate: string): boolean {
  const key = normalizeKey(candidate);
  if (!key) return true;
  return parts.some((p) => {
    const pk = normalizeKey(p);
    return pk === key || pk.includes(key) || key.includes(pk);
  });
}

/** Parse the INGREDIENTS: line from label OCR snippets (when raw_list is incomplete). */
export function parseIngredientsLineFromSnippet(snippet: string): string[] {
  const m = snippet.match(
    /INGREDIENTS?\s*:\s*([\s\S]+?)(?:Spice\s+Content|Allergen|NO\s+MSG|THIS\s+MIXED|Manufactured|FSSAI|$)/i,
  );
  if (!m?.[1]) return [];
  return splitIngredientSegments(repairIngredientListText(m[1]));
}

/** Oil used in frying/processing, often on a separate line from the numbered ingredients list. */
export function extractProcessingOilFromSnippet(snippet: string): string | null {
  const m = snippet.match(
    /(?:THIS\s+)?(?:MIXED\s+MASALA\s+)?(?:HAS\s+)?(?:BEEN\s+)?(?:FRIED|FRYING|PROCESSED|COOKED)\s+(?:IN|WITH)\s+([A-Z][A-Z\s-]*OIL)\b/i,
  );
  if (!m?.[1]) return null;
  const oil = m[1]
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return oil;
}

function allergenIngredients(contains: string[]): string[] {
  const out: string[] = [];
  for (const item of contains) {
    const t = item.trim();
    if (!t) continue;
    if (/mustard/i.test(t) && !/seed/i.test(t)) out.push("Mustard seeds");
    else out.push(t);
  }
  return out;
}

/**
 * Build a full ingredient list from DeepSeek label JSON, including lines that
 * models often omit from raw_list (e.g. "fried in groundnut oil").
 */
export function buildIngredientsFromDeepseekLabel(extracted: ExtractedLabel): string | null {
  const parts: string[] = [];

  const add = (item: string) => {
    const t = repairIngredientListText(item);
    if (!t || alreadyListed(parts, t)) return;
    parts.push(t);
  };

  for (const item of extracted.ingredients.raw_list) add(item);

  const snippets = [
    evidenceSnippet(extracted.ingredients.evidence),
    evidenceSnippet(extracted.allergens.evidence),
    evidenceSnippet(extracted.regulatory.evidence),
  ].filter(Boolean);

  for (const snippet of snippets) {
    for (const seg of parseIngredientsLineFromSnippet(snippet)) add(seg);
    const oil = extractProcessingOilFromSnippet(snippet);
    if (oil) add(oil);
  }

  for (const item of allergenIngredients(extracted.allergens.contains)) {
    if (/mustard/i.test(item)) add(item);
  }

  if (parts.length === 0) return null;

  const formatted =
    formatIngredientsList(parts.join(", ")) ?? parts.join(", ");
  return formatted.length >= 10 ? formatted : null;
}

export function reconcileDisplayIngredients(opts: {
  ingredients_raw: string | null;
  ocr_payload?: Record<string, unknown> | null;
  productName?: string | null;
}): string | null {
  const stored = opts.ingredients_raw?.trim() || null;
  const deepseek = opts.ocr_payload?.deepseek_label as
    | { extracted?: ExtractedLabel }
    | undefined;
  const extracted = deepseek?.extracted;
  const fromLabel = extracted ? buildIngredientsFromDeepseekLabel(extracted) : null;

  if (!fromLabel) return stored;
  if (!stored) return fromLabel;

  const storedSegments = splitIngredientSegments(stored);
  const labelSegments = splitIngredientSegments(fromLabel);

  const storedMarketing = isMarketingIngredientList(stored, opts.productName);
  const labelMarketing = isMarketingIngredientList(fromLabel, opts.productName);

  if (storedMarketing && !labelMarketing) return fromLabel;
  if (!storedMarketing && labelMarketing) return stored;

  if (labelSegments.length > storedSegments.length) return fromLabel;
  if (storedSegments.length > labelSegments.length) return stored;

  const labelHasPct = labelSegments.some((s) => /\d+\s*%/.test(s));
  const storedHasPct = storedSegments.some((s) => /\d+\s*%/.test(s));
  if (labelHasPct && !storedHasPct) return fromLabel;

  return stored.length >= fromLabel.length ? stored : fromLabel;
}

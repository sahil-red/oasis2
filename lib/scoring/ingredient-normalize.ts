import { repairIngredientFragment } from "@/lib/ocr/format-ingredients";
import {
  isGenericIngredientCategory,
  isIngredientBoilerplate,
} from "@/lib/scoring/ingredient-generic-heads";

/**
 * Expand compound ingredient segments (parentheses, nested lists) into atomic
 * tokens and normalize garbage (leading punctuation, descriptors, aliases).
 */

const DESCRIPTOR_WORDS = new Set([
  "reconstituted",
  "dried",
  "powdered",
  "dehydrated",
  "refined",
  "bleached",
  "fortified",
  "enriched",
  "skimmed",
  "full-fat",
  "pasteurised",
  "pasteurized",
  "homogenized",
  "fermented",
  "roasted",
  "toasted",
  "iodized",
  "iodised",
  "standardized",
]);

const ALIAS_MAP: Record<string, string> = {
  "fructo-oligosacchrides": "fructooligosaccharides",
  "fructo-oligosaccharides": "fructooligosaccharides",
  fos: "fructooligosaccharides",
  gos: "galactooligosaccharides",
  "acesulfame k": "acesulfame potassium",
  "acesulfame-k": "acesulfame potassium",
  e950: "acesulfame potassium",
  e951: "aspartame",
  e955: "sucralose",
  "ins 471": "mono and diglycerides of fatty acids",
  ins471: "mono and diglycerides of fatty acids",
  edta: "calcium disodium edta",
  msg: "monosodium glutamate",
  e621: "monosodium glutamate",
};

/**
 * Given a raw ingredient fragment (may be compound like
 * "seasoning (salt 40%, sugar, spices)"), return normalized atomic names
 * ready for LLM rating.
 */
export function expandAndNormalize(raw: string): string[] {
  const trimmed = repairIngredientFragment(raw).toLowerCase();
  if (!trimmed) return [];
  const results: string[] = [];
  expandCompound(trimmed, results);
  return results
    .map(normalizeToken)
    .filter(isValidIngredientToken)
    .filter((v, i, a) => a.indexOf(v) === i);
}

function expandCompound(token: string, out: string[]): void {
  const cleaned = repairIngredientFragment(token).toLowerCase();
  if (!cleaned) return;

  const colon = cleaned.indexOf(":");
  if (
    colon > 2 &&
    colon < cleaned.length - 3 &&
    !/^(ins|e)\s*\d/i.test(cleaned)
  ) {
    const left = cleaned.slice(0, colon).trim();
    const right = cleaned.slice(colon + 1).trim();
    if (left.length >= 3 && !isGenericIngredientCategory(left)) out.push(left);
    if (right.length >= 3) expandCompound(right, out);
    return;
  }

  const paren = cleaned.indexOf("(");
  if (paren === -1) {
    if (cleaned.length >= 3 && !isGenericIngredientCategory(cleaned)) out.push(cleaned);
    return;
  }

  const parent = cleaned.slice(0, paren).trim();
  if (parent.length >= 3 && !isGenericIngredientCategory(parent)) out.push(parent);

  const close = findMatchingParen(cleaned, paren);
  const inner = cleaned.slice(paren + 1, close);

  for (const part of splitByCommaRespectingParens(inner)) {
    const piece = part.trim();
    if (piece.length >= 3) expandCompound(piece, out);
  }

  const tail = cleaned
    .slice(close + 1)
    .trim()
    .replace(/^[,;]+/, "")
    .trim();
  if (tail.length >= 3) expandCompound(tail, out);
}

function findMatchingParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length - 1;
}

function splitByCommaRespectingParens(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function normalizeToken(token: string): string {
  let s = token
    .replace(/^[\s"'`[;,.\-–—:]+/, "")
    .replace(/[\s"'`]+$/, "")
    .replace(/\s*\d+(\.\d+)?\s*%/g, "")
    .replace(/^(?:an?|the)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();

  const words = s.split(" ").filter((w) => w && !DESCRIPTOR_WORDS.has(w));
  s = words.join(" ").trim();

  if (!s) return s;
  return ALIAS_MAP[s] ?? s;
}

function isValidIngredientToken(s: string): boolean {
  if (s.length < 3 || s.length > 60) return false;
  if (!/[a-z]/.test(s)) return false;
  if (isGenericIngredientCategory(s) || isIngredientBoilerplate(s)) return false;
  // OCR/list debris — not real ingredient names
  if (/^[\]}\),*&.\s"']/.test(s) || /["'`]$/.test(s)) return false;
  if (/[\]{}]/.test(s)) return false;
  if (/^["']/.test(s) || /\bins-\d/.test(s)) return false;
  if (/^[\d\s\-ins.]+$/i.test(s) && !/[a-z]{3,}/.test(s)) return false;
  return true;
}

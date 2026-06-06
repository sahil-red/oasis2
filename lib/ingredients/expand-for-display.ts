import {
  formatSegment,
  repairIngredientFragment,
  repairIngredientListText,
} from "@/lib/ocr/format-ingredients";
import {
  isGenericIngredientCategory,
  isIngredientBoilerplate,
} from "@/lib/scoring/ingredient-generic-heads";
import { normalizeIngredientName } from "@/lib/scoring/normalize-ingredient-name";

/** Skip section headers, allergen lines, and other non-ingredient debris. */
function shouldSkipToken(fragment: string): boolean {
  const lower = fragment.toLowerCase().trim();
  if (lower.length < 2) return true;
  if (/\bingredients?\s*$/i.test(lower)) return true;
  if (isIngredientBoilerplate(lower)) return true;
  if (/^contains\s+oligo/i.test(lower)) return true;
  if (/^\d+(\.\d+)?\s*(g|gm|mg)\s*\/\s*100\s*g/i.test(lower)) return true;
  if (/^(hydrogenated|reconstituted|refined|fortified|pasteurized|pasteurised|roasted|toasted)$/i.test(lower)) {
    return true;
  }
  return false;
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

/** Split on commas and sentence periods at parenthesis depth 0 (FSSAI lists). */
export function splitIngredientParts(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);

    if (depth !== 0) continue;

    if (ch === "," || ch === ";") {
      parts.push(s.slice(start, i));
      start = i + 1;
      continue;
    }

    if (ch === "." && i > 0 && i < s.length - 1) {
      const prev = s[i - 1]!;
      const next = s[i + 1]!;
      if (/\d/.test(prev) && /\d/.test(next)) continue;
      const after = s.slice(i + 1).trimStart();
      if (after.length >= 2) {
        parts.push(s.slice(start, i));
        start = i + 1;
      }
    }
  }

  parts.push(s.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

function pushDisplayToken(out: string[], seen: Set<string>, fragment: string) {
  const formatted = formatSegment(fragment);
  if (!formatted || shouldSkipToken(formatted)) return;
  const normalized = normalizeIngredientName(formatted);
  if (normalized.length < 2 || isGenericIngredientCategory(normalized)) return;
  const key = formatted.toLowerCase().replace(/\s+/g, " ");
  if (seen.has(key)) return;
  seen.add(key);
  out.push(formatted);
}

/** Recursively flatten compound FSSAI ingredient fragments for PDP display. */
export function collectDisplayFragments(fragment: string, out: string[], seen: Set<string>) {
  const cleaned = repairIngredientFragment(fragment);
  if (!cleaned || shouldSkipToken(cleaned)) return;

  const sectionColon = cleaned.match(/^(.{0,80}?\bingredients?)\s*:\s*(.+)$/i);
  if (sectionColon?.[2]) {
    collectDisplayFragments(sectionColon[2], out, seen);
    return;
  }

  const colon = cleaned.indexOf(":");
  if (
    colon > 2 &&
    colon < cleaned.length - 3 &&
    !/^(ins|e)\s*\d/i.test(cleaned) &&
    !/\d\s*%/.test(cleaned.slice(0, colon))
  ) {
    const left = cleaned.slice(0, colon).trim();
    const right = cleaned.slice(colon + 1).trim();
    if (/ingredients?/i.test(left)) {
      collectDisplayFragments(right, out, seen);
      return;
    }
    if (!isGenericIngredientCategory(left.toLowerCase())) pushDisplayToken(out, seen, left);
    if (right) collectDisplayFragments(right, out, seen);
    return;
  }

  const paren = cleaned.indexOf("(");
  if (paren === -1) {
    pushDisplayToken(out, seen, cleaned);
    return;
  }

  const parent = cleaned.slice(0, paren).trim();
  const close = findMatchingParen(cleaned, paren);
  const inner = cleaned.slice(paren + 1, close).trim();

  const pctOnly = /^\d+(?:\.\d+)?\s*%$/.test(inner);
  const parentGeneric = isGenericIngredientCategory(normalizeIngredientName(parent));

  if (pctOnly) {
    // "Strawberry (2%)" — keep the percent with its ingredient.
    if (parent.length >= 2) pushDisplayToken(out, seen, `${parent} (${inner})`);
  } else if (parentGeneric || parent.length < 2) {
    // Additive/category head ("Emulsifier (INS 322)") — drop the head and surface the
    // real additive(s) inside, which are what we actually rate.
    if (inner) for (const part of splitIngredientParts(inner)) collectDisplayFragments(part, out, seen);
  } else {
    // Real compound ("Toned Milk (Water, Milk Solids)", "Vitamins (B12, D, A)") — show as
    // ONE line with its breakdown in brackets, not flattened to top-level rows.
    const innerFmt = inner
      ? inner.split(",").map((s) => s.trim()).filter(Boolean).join(", ")
      : "";
    pushDisplayToken(out, seen, innerFmt ? `${parent} (${innerFmt})` : parent);
  }

  const tail = cleaned
    .slice(close + 1)
    .trim()
    .replace(/^[,;.\s]+/, "")
    .trim();
  if (tail) collectDisplayFragments(tail, out, seen);
}

/** Full label → ordered, deduped display fragments (title case). */
export function expandIngredientsForDisplay(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  const repaired = repairIngredientListText(raw);
  const disclaimerCut = repaired.search(/\bcontains\s+oligo/i);
  const text = disclaimerCut > 40 ? repaired.slice(0, disclaimerCut).trim() : repaired;

  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of splitIngredientParts(text)) {
    collectDisplayFragments(part, out, seen);
  }
  return out;
}

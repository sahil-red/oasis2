/** Normalize ingredient lists for display and storage (comma-separated, title case, brackets). */

/** Fix common OCR/LM artifacts before splitting or formatting. */
export function repairIngredientListText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[\u2018\u2019\u201C\u201D]/g, "")
    .replace(/["'`]/g, "")
    .replace(/(\d)\s*\}\s*/g, "$1) ")
    .replace(/\{\s*/g, "(")
    .replace(/\s*\}/g, ")")
    .replace(/\(\s*\(/g, "(")
    .replace(/\)\s*\){3,}/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

export function repairIngredientFragment(fragment: string): string {
  return repairIngredientListText(fragment)
    .replace(/^[\s"'`,;.\-–—:]+/, "")
    .replace(/[\s"'`,;.\-–—:]+$/, "")
    .trim();
}

const SMALL_WORDS = new Set([
  "and",
  "or",
  "with",
  "of",
  "in",
  "on",
  "a",
  "an",
  "the",
  "de",
  "van",
  "per",
]);

/** INS / E-number / percent tokens — keep as-is. */
function preserveTokenCase(word: string, index: number): string {
  if (/^\d/.test(word)) return word;
  if (/^(INS|E)\s*\d+/i.test(word)) return word.toUpperCase().replace(/\s+/g, " ");
  if (word === word.toUpperCase() && word.length <= 6) return word;
  if (index > 0 && SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCasePhrase(text: string): string {
  const parts = text.split(/(\s+)/);
  let wordIndex = 0;
  return parts
    .map((part) => {
      if (!part.trim()) return part;
      const bits = part.split(/([-/])/);
      const titled = bits
        .map((bit, i) => {
          if (bit === "-" || bit === "/") return bit;
          return bit
            .split(/(\d+)/)
            .map((seg) => {
              if (!seg.trim() || /^\d/.test(seg)) return seg;
              const out = preserveTokenCase(seg, wordIndex);
              wordIndex++;
              return out;
            })
            .join("");
        })
        .join("");
      return titled;
    })
    .join("");
}

/** Title-case inside bracket groups without breaking nested structure. */
function formatBracketedContent(inner: string): string {
  return inner
    .split(/([,;]+)/)
    .map((chunk) => (/^[,;]+$/.test(chunk) ? chunk : titleCasePhrase(chunk.trim())))
    .join("")
    .trim();
}

export function formatSegment(segment: string): string {
  let s = repairIngredientFragment(segment);
  if (!s) return "";
  s = s.replace(/\s+/g, " ");

  s = s.replace(/\s*([({[])\s*/g, " $1");
  s = s.replace(/\s*([)}\]])\s*/g, "$1");
  s = s.replace(/([)}\]])\s*,/g, "$1, ");
  s = s.replace(/\s*,\s*/g, ", ");
  s = s.replace(/\s*;\s*/g, "; ");

  s = s.replace(/([({[])([^)}\]]+)([)}\]])/g, (_m, open, inner, close) => {
    return `${open}${formatBracketedContent(inner)}${close}`;
  });

  return titleCasePhrase(s);
}

export function splitIngredientSegments(raw: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let buf = "";

  for (const ch of raw) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);

    if ((ch === "," || ch === ";") && depth === 0) {
      if (buf.trim()) segments.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) segments.push(buf.trim());
  return segments;
}

/**
 * Canonical ingredient list: comma-separated segments, balanced brackets, title case.
 * Returns null for empty input.
 */
export function formatIngredientsList(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let text = raw.trim();
  if (!text) return null;

  text = text.replace(/^ingredients?\s*[:\-]?\s*/i, "");
  text = repairIngredientListText(text);
  text = text.replace(/\s+/g, " ");

  const segments = splitIngredientSegments(text)
    .map(formatSegment)
    .filter(Boolean);

  if (!segments.length) return null;
  return segments.join(", ");
}

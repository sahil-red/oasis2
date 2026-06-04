import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";

const INS_E_CODE_RE = /\b(?:ins|e)[\s-]?(\d{3,4}[a-z]?)\b/gi;

/** INS / E numbers on Indian labels — not insulin. */
export function insCodesFromText(text: string): string[] {
  return [...text.matchAll(INS_E_CODE_RE)].map((m) => m[1]!.toLowerCase());
}

export function isInsulinMislabel(display: string | null | undefined): boolean {
  return Boolean(display?.trim() && /^insulin\b/i.test(display.trim()));
}

function rowLookupScore(row: IngredientIntelligenceRow): number {
  let score = 0;
  if (row.concern_tier === "innocuous") score += 20;
  else if (row.concern_tier === "watchful") score += 10;
  else if (row.concern_tier === "problematic") score -= 5;
  else if (row.concern_tier === "hazardous") score -= 10;
  if (isInsulinMislabel(row.display_name)) score -= 100;
  return score;
}

export function lookupKeysForInsCode(code: string): string[] {
  return [`e${code}`, `e ${code}`, `ins ${code}`, `ins${code}`];
}

/** Pick the best intelligence row for a token; prefer innocuous E-number rows over “Insulin” misreads. */
export function resolveIngredientIntelligenceRow(
  token: string,
  byName: Map<string, IngredientIntelligenceRow>,
  expandAtoms: (token: string) => string[],
): IngredientIntelligenceRow | null {
  const codes = insCodesFromText(token);
  if (codes.length) {
    const candidates: IngredientIntelligenceRow[] = [];
    for (const code of codes) {
      for (const key of lookupKeysForInsCode(code)) {
        const row = byName.get(key);
        if (row) candidates.push(row);
      }
    }
    if (candidates.length) {
      return [...candidates].sort((a, b) => rowLookupScore(b) - rowLookupScore(a))[0]!;
    }
  }

  const direct = byName.get(token);
  if (direct && !isInsulinMislabel(direct.display_name)) return direct;

  for (const atom of expandAtoms(token)) {
    const atomCodes = insCodesFromText(atom);
    if (atomCodes.length) {
      const candidates: IngredientIntelligenceRow[] = [];
      for (const code of atomCodes) {
        for (const key of lookupKeysForInsCode(code)) {
          const row = byName.get(key);
          if (row) candidates.push(row);
        }
      }
      if (candidates.length) {
        return [...candidates].sort((a, b) => rowLookupScore(b) - rowLookupScore(a))[0]!;
      }
    }
    const row = byName.get(atom);
    if (row && !isInsulinMislabel(row.display_name)) return row;
  }

  return direct && !isInsulinMislabel(direct.display_name) ? direct : null;
}

/** When scoring, never treat INS/E codes mislabeled as insulin as problematic. */
export function effectiveConcernTier(
  token: string,
  row: IngredientIntelligenceRow,
): IngredientIntelligenceRow["concern_tier"] {
  const code = insCodesFromText(token)[0] ?? insCodesFromText(row.normalized_name)[0];
  if (code && isInsulinMislabel(row.display_name)) {
    return "innocuous";
  }
  return row.concern_tier;
}

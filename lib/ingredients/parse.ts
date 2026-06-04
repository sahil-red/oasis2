import rulesJson from "@/data/ingredient-rules.json";
import type { AdditiveTier } from "@/lib/utils";
import type { IngredientRule } from "@/lib/scoring/rules";

const RULES: IngredientRule[] = (rulesJson as { rules: IngredientRule[] }).rules;

export type IngredientRisk = AdditiveTier | "unknown" | "risk-free";

export interface ParsedIngredient {
  /** Normalized token for matching */
  key: string;
  /** Human-readable line */
  display: string;
  eNumber: string | null;
  percent: string | null;
  risk: IngredientRisk;
  tierLabel: string;
  why: string | null;
  flagged: boolean;
}

const TIER_LABELS: Record<IngredientRisk, string> = {
  "risk-free": "Neutral",
  unknown: "Neutral",
  limited: "Limited risk",
  moderate: "Moderate risk",
  hazardous: "High risk",
};

/** Split ingredient list respecting parentheses, brackets and braces (FSSAI-style lists). */
export function splitIngredientList(raw: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;

  for (const ch of raw) {
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);

    if ((ch === "," || ch === ";" || ch === "\n") && depth === 0) {
      const t = buf.trim();
      if (t) parts.push(t);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) parts.push(tail);
  return parts;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textIncludesNeedle(text: string, needle: string): boolean {
  const n = needle.toLowerCase().trim();
  if (n.length < 2) return false;
  if (n.length < 5) {
    return new RegExp(`\\b${escapeRe(n)}\\b`, "i").test(text);
  }
  return text.toLowerCase().includes(n);
}

function classifyToken(token: string): {
  risk: IngredientRisk;
  why: string | null;
  ruleName: string | null;
} {
  const text = token.toLowerCase();

  for (const rule of RULES) {
    const needles = [rule.match, ...rule.aliases];
    for (const needle of needles) {
      if (textIncludesNeedle(text, needle)) {
        return { risk: rule.tier, why: rule.why, ruleName: rule.match };
      }
    }
  }

  return { risk: "risk-free", why: null, ruleName: null };
}

function extractMeta(token: string): { name: string; eNumber: string | null; percent: string | null } {
  const eMatch = /\b(?:e|ins)[\s-]?(\d{3,4}[a-z]?)\b/i.exec(token);
  const eNumber = eMatch ? `E${eMatch[1].toUpperCase()}` : null;

  const pctMatch = /(\d+(?:\.\d+)?)\s*%/.exec(token);
  const percent = pctMatch ? `${pctMatch[1]}%` : null;

  let name = token
    .replace(/\([^)]*\)/g, (m) => {
      if (/e\d{3,4}|ins\s*\d/i.test(m)) return "";
      return m;
    })
    .replace(/\s+/g, " ")
    .trim();

  if (name.length > 80) name = `${name.slice(0, 77)}…`;

  return { name: name || token.trim(), eNumber, percent };
}

const RISK_ORDER: Record<IngredientRisk, number> = {
  hazardous: 0,
  moderate: 1,
  limited: 2,
  unknown: 3,
  "risk-free": 4,
};

export function parseIngredientsForDisplay(raw: string | null): ParsedIngredient[] {
  if (!raw?.trim()) return [];

  const tokens = splitIngredientList(raw);
  const seen = new Set<string>();

  const items: ParsedIngredient[] = [];

  for (const token of tokens) {
    const key = token.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);

    const { name, eNumber, percent } = extractMeta(token);
    const { risk, why } = classifyToken(token);
    const flagged = risk !== "risk-free" && risk !== "unknown";

    items.push({
      key,
      display: name,
      eNumber,
      percent,
      risk,
      tierLabel: TIER_LABELS[risk],
      why,
      flagged,
    });
  }

  items.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
  return items;
}

export function ingredientSummary(items: ParsedIngredient[]) {
  const flagged = items.filter((i) => i.flagged).length;
  const hazardous = items.filter((i) => i.risk === "hazardous").length;
  const moderate = items.filter((i) => i.risk === "moderate" || i.risk === "limited").length;
  const safe = items.length - flagged - items.filter((i) => i.risk === "unknown").length;
  return { total: items.length, flagged, hazardous, moderate, safe };
}

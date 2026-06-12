import {
  ingredientSummary,
  parseIngredientsForDisplay,
  type IngredientRisk,
  type ParsedIngredient,
} from "@/lib/ingredients/parse";
import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";
import { expandAndNormalize } from "@/lib/scoring/ingredient-normalize";
import { getKnownIngredient as lookupKnownIngredient } from "@/lib/scoring/ingredient-known";
import type { KnownIngredient } from "@/lib/scoring/ingredient-known";
import {
  insCodesFromText,
  isInsulinMislabel,
  resolveIngredientIntelligenceRow,
} from "@/lib/scoring/intelligence-row-resolve";
import { normalizeIngredientName } from "@/lib/scoring/normalize-ingredient-name";

const BENEFICIAL_ROLES = new Set([
  "probiotic",
  "base_food",
  "vitamin_mineral",
]);

const PROBIOTIC_NAME_RE =
  /\b(probiotic|prebiotic|fos|fructooligosaccharide|inulin|culture|lactobacillus|bifidobacterium|bacillus)\b/i;

function isProbioticName(...parts: string[]): boolean {
  return PROBIOTIC_NAME_RE.test(parts.join(" "));
}

function isPrebioticRole(row: IngredientIntelligenceRow): boolean {
  return row.role === "probiotic" || PROBIOTIC_NAME_RE.test(row.normalized_name);
}

const TIER_LABELS: Record<IngredientRisk, string> = {
  "risk-free": "Beneficial",
  unknown: "Neutral",
  limited: "Watchful",
  moderate: "Problematic",
  hazardous: "High risk",
};

function riskFromIntelligence(
  row: IngredientIntelligenceRow,
  displayName: string,
): IngredientRisk {
  if (isPrebioticRole(row) || isProbioticName(displayName, row.display_name ?? "", row.normalized_name)) {
    return "risk-free";
  }
  if (row.concern_tier === "hazardous" || row.concern_tier === "problematic") {
    return "hazardous";
  }
  if (row.concern_tier === "watchful") return "limited";
  if (row.concern_tier === "innocuous") {
    return BENEFICIAL_ROLES.has(row.role) ? "risk-free" : "unknown";
  }
  return "unknown";
}

function tierLabelFromIntelligence(row: IngredientIntelligenceRow, displayName: string): string {
  if (isPrebioticRole(row) || isProbioticName(displayName, row.display_name ?? "", row.normalized_name)) {
    return "Prebiotic";
  }
  const risk = riskFromIntelligence(row, displayName);
  if (risk === "risk-free" && row.nova_class) return `NOVA ${row.nova_class} · Beneficial`;
  if (row.nova_class) return `NOVA ${row.nova_class} · ${TIER_LABELS[risk]}`;
  return TIER_LABELS[risk];
}

function applyProbioticDisplayFallback(
  item: IngredientDisplayItem,
): IngredientDisplayItem {
  if (!isProbioticName(item.display, item.key)) return item;
  return {
    ...item,
    risk: "risk-free",
    tierLabel: "Prebiotic / Probiotic",
    flagged: false,
  };
}

const RISK_ORDER: Record<IngredientRisk, number> = {
  hazardous: 0,
  moderate: 1,
  limited: 2,
  unknown: 3,
  "risk-free": 4,
};

export type IngredientDisplaySource = "intelligence" | "rules";

export type IngredientDisplayItem = ParsedIngredient & {
  source: IngredientDisplaySource;
  nova_class?: number;
  role?: string;
};

function lookupIntelligence(
  token: string,
  byName: Map<string, IngredientIntelligenceRow>,
): IngredientIntelligenceRow | null {
  const direct = normalizeIngredientName(token);
  return resolveIngredientIntelligenceRow(direct, byName, expandAndNormalize);
}

function displayFromIntelligenceRow(
  token: string,
  row: IngredientIntelligenceRow,
  base: ParsedIngredient,
): string {
  const code = insCodesFromText(token)[0] ?? insCodesFromText(row.normalized_name)[0];
  if (code && isInsulinMislabel(row.display_name)) {
    return base.eNumber ?? `INS ${code.toUpperCase()}`;
  }
  const baseName = row.display_name?.trim() || base.display;

  // If the token contains sub-ingredients in [] or {}, append them so they
  // aren't silently dropped when the intelligence name replaces the full token.
  const bracketMatch = token.match(/\[([^\]]{2,})\]|\{([^}]{2,})\}/);
  if (bracketMatch) {
    const sub = (bracketMatch[1] ?? bracketMatch[2] ?? "").trim();
    // Strip INS/E codes from the sub-ingredient list — keep only food names
    const cleaned = sub
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !/^\s*(ins|e)\s*\d/i.test(s))
      .join(", ");
    if (cleaned) return `${baseName} (${cleaned})`;
  }

  return baseName;
}

function fromIntelligence(
  token: string,
  row: IngredientIntelligenceRow,
  base: ParsedIngredient,
): IngredientDisplayItem {
  const code = insCodesFromText(token)[0] ?? insCodesFromText(row.normalized_name)[0];
  const insulinMislabel = Boolean(code && isInsulinMislabel(row.display_name));
  const display = displayFromIntelligenceRow(token, row, base);
  let risk = riskFromIntelligence(row, display);
  let why =
    row.concern_reasons.length > 0
      ? row.concern_reasons.join(" · ")
      : base.why;

  if (insulinMislabel) {
    // Prefer E-number row tier when the cached row misread INS as insulin.
    risk = row.concern_tier === "innocuous" || row.concern_tier === "watchful" ? "unknown" : "limited";
    why = "Food additive code (INS/E number), not insulin";
  }

  const nova = row.nova_class;

  let tierLabel: string;
  if (isPrebioticRole(row) || isProbioticName(display, base.key, row.normalized_name)) {
    tierLabel = "Prebiotic · Beneficial";
  } else if (risk === "risk-free") {
    tierLabel = nova ? `Beneficial · NOVA ${nova}` : "Beneficial";
  } else if (risk === "unknown") {
    tierLabel = nova ? `Neutral · NOVA ${nova}` : "Neutral";
  } else {
    tierLabel = nova ? `${TIER_LABELS[risk]} · NOVA ${nova}` : TIER_LABELS[risk];
  }

  return {
    ...base,
    display,
    risk,
    tierLabel,
    why,
    flagged: risk !== "risk-free" && risk !== "unknown",
    source: "intelligence",
    nova_class: nova,
    role: row.role,
  };
}

/** Build display item from the curated known-ingredient dictionary when no intelligence row or rule matches. */
function fromKnownIngredient(
  token: string,
  known: KnownIngredient,
  base: ParsedIngredient,
): IngredientDisplayItem {
  const display = known.display_name?.trim() || base.display;
  const isPrebiotic = known.role === "probiotic" || isProbioticName(display, base.key, known.normalized_name);

  let risk: IngredientRisk;
  if (known.concern_tier === "hazardous" || known.concern_tier === "problematic") {
    risk = "hazardous";
  } else if (known.concern_tier === "watchful") {
    risk = "limited";
  } else if (known.concern_tier === "innocuous") {
    risk = BENEFICIAL_ROLES.has(known.role) ? "risk-free" : "unknown";
  } else {
    risk = "unknown";
  }

  const why = known.concern_reasons.length > 0 ? known.concern_reasons.join(" · ") : base.why;
  const nova = known.nova_class;

  let tierLabel: string;
  if (isPrebiotic) {
    tierLabel = "Prebiotic · Beneficial";
  } else if (risk === "risk-free") {
    tierLabel = nova ? `Beneficial · NOVA ${nova}` : "Beneficial";
  } else if (risk === "unknown") {
    tierLabel = nova ? `Neutral · NOVA ${nova}` : "Neutral";
  } else {
    tierLabel = nova ? `${TIER_LABELS[risk]} · NOVA ${nova}` : TIER_LABELS[risk];
  }

  return {
    ...base,
    display,
    risk,
    tierLabel,
    why,
    flagged: risk !== "risk-free" && risk !== "unknown",
    source: "intelligence",
    nova_class: nova,
    role: known.role,
  };
}

/** Label segments enriched with cached ingredient_intelligence (regex fallback). */
export function parseIngredientsForDisplayWithIntelligence(
  raw: string | null,
  intelligenceRows: IngredientIntelligenceRow[],
): IngredientDisplayItem[] {
  const base = parseIngredientsForDisplay(raw);
  if (!intelligenceRows.length) {
    return base.map((item) => ({ ...item, source: "rules" as const }));
  }

  const byName = new Map(
    intelligenceRows.map((r) => [r.normalized_name, r]),
  );

  const items: IngredientDisplayItem[] = [];
  const seen = new Set<string>();

  for (const item of base) {
    let next: IngredientDisplayItem;
    const baseKey = item.key.split("|")[0] ?? item.key;
    const row = lookupIntelligence(baseKey, byName);
    if (row) {
      next = fromIntelligence(item.key, row, item);
    } else {
      const known = lookupKnownIngredient(baseKey);
      next = known
        ? fromKnownIngredient(item.key, known, item)
        : { ...item, source: "rules" as const };
    }
    const dedupe = `${next.display}|${next.percent ?? ""}|${next.eNumber ?? ""}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    items.push(next);
  }

  items.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
  return items.map(applyProbioticDisplayFallback);
}

export function ingredientDisplaySummary(items: IngredientDisplayItem[]) {
  const base = ingredientSummary(items);
  const rated = items.filter((i) => i.source === "intelligence").length;
  return { ...base, rated };
}

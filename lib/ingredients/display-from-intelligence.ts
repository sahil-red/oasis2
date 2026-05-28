import {
  ingredientSummary,
  parseIngredientsForDisplay,
  type IngredientRisk,
  type ParsedIngredient,
} from "@/lib/ingredients/parse";
import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";
import { expandAndNormalize } from "@/lib/scoring/ingredient-normalize";
import { normalizeIngredientName } from "@/lib/scoring/normalize-ingredient-name";

const BENEFICIAL_ROLES = new Set([
  "probiotic",
  "base_food",
  "vitamin_mineral",
]);

const PROBIOTIC_NAME_RE =
  /\b(probiotic|culture|lactobacillus|bifidobacterium|bacillus)\b/i;

function isProbioticName(...parts: string[]): boolean {
  return PROBIOTIC_NAME_RE.test(parts.join(" "));
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
  if (isProbioticName(displayName, row.display_name ?? "", row.normalized_name)) {
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

function applyProbioticDisplayFallback(
  item: IngredientDisplayItem,
): IngredientDisplayItem {
  if (!isProbioticName(item.display, item.key)) return item;
  return {
    ...item,
    risk: "risk-free",
    tierLabel: "Probiotic",
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
  const hit = byName.get(direct);
  if (hit) return hit;

  for (const atom of expandAndNormalize(token)) {
    const row = byName.get(atom);
    if (row) return row;
  }
  return null;
}

function fromIntelligence(
  token: string,
  row: IngredientIntelligenceRow,
  base: ParsedIngredient,
): IngredientDisplayItem {
  const display = row.display_name?.trim() || base.display;
  const risk = riskFromIntelligence(row, display);
  const why =
    row.concern_reasons.length > 0
      ? row.concern_reasons.join(" ")
      : base.why;
  const nova = row.nova_class;
  const role = row.role.replace(/_/g, " ");
  const tierLabel =
    risk === "risk-free" && isProbioticName(display, base.key)
      ? "Probiotic"
      : risk === "unknown"
        ? `Neutral · NOVA ${nova}`
        : risk === "risk-free"
          ? `${TIER_LABELS[risk]} · ${role}`
          : `${TIER_LABELS[risk]} · NOVA ${nova}`;

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
    const row = lookupIntelligence(item.key, byName);
    const next = row
      ? fromIntelligence(item.key, row, item)
      : { ...item, source: "rules" as const };
    if (seen.has(next.key)) continue;
    seen.add(next.key);
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

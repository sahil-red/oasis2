/**
 * Ingredient-list heuristics beyond named additive rules — processing classes,
 * whole-food positives, and refined-base negatives.
 */

import { matchAdditives } from "@/lib/scoring/rules";

export interface IngredientSignalResult {
  /** Adjustment applied to the 0–60 nutrition subscore (clamped internally). */
  nutritionDelta: number;
  /** Extra 0–10 label subscore points. */
  labelsDelta: number;
  notes: string[];
}

const PROCESSING_CLASSES: { pattern: RegExp; penalty: number; note: string }[] = [
  {
    pattern: /\b(preservative|preservatives|preserved with)\b/i,
    penalty: 2.5,
    note: "Preservatives on label",
  },
  {
    pattern: /\b(emulsifier|emulsifiers|emulsifying)\b/i,
    penalty: 2,
    note: "Emulsifiers on label",
  },
  {
    pattern: /\b(stabilizer|stabiliser|stabilizers|stabilisers)\b/i,
    penalty: 1.5,
    note: "Stabilizers on label",
  },
  {
    pattern: /\b(thickener|thickeners|thickening agent)\b/i,
    penalty: 1.5,
    note: "Thickeners on label",
  },
  {
    pattern: /\b(artificial flavour|artificial flavor|artificial colour|artificial color)\b/i,
    penalty: 2.5,
    note: "Artificial flavours/colours",
  },
  {
    pattern: /\b(flavour enhancer|flavor enhancer)\b/i,
    penalty: 1.5,
    note: "Flavour enhancers",
  },
  {
    pattern: /\b(acidity regulator|raising agent|firming agent)\b/i,
    penalty: 1,
    note: "Processing aids",
  },
  {
    pattern: /\b(ins\s*\d{3,4}|e\d{3,4}\b)/i,
    penalty: 1,
    note: "Numbered additives (INS/E-code)",
  },
];

const POSITIVE_SIGNALS: { pattern: RegExp; nutrition: number; labels: number; note: string }[] = [
  {
    pattern: /\b(whole wheat|wholewheat|whole grain|multigrain|multi-grain|ragi|bajra|jowar|millet)\b/i,
    nutrition: 4,
    labels: 2,
    note: "Whole grain / millet base",
  },
  {
    pattern: /\b(jaggery|gud|honey|dates?|date syrup|coconut sugar)\b/i,
    nutrition: 2,
    labels: 2,
    note: "Less-refined sweetener",
  },
  {
    pattern: /\b(no preserv|preservative[- ]?free|without preserv)\b/i,
    nutrition: 0,
    labels: 3,
    note: "No preservatives claim",
  },
  {
    pattern: /\b(no added sugar|unsweetened|zero added sugar)\b/i,
    nutrition: 2,
    labels: 2,
    note: "No added sugar claim",
  },
  {
    pattern: /\b(organic|jaivik)\b/i,
    nutrition: 1,
    labels: 2,
    note: "Organic on label",
  },
  {
    pattern: /\b(short list|few ingredients|only \d+ ingredient)\b/i,
    nutrition: 2,
    labels: 1,
    note: "Short ingredient list",
  },
];

const NEGATIVE_BASE: { pattern: RegExp; nutrition: number; note: string }[] = [
  {
    pattern: /\b(refined wheat flour|maida|refined flour)\b/i,
    nutrition: -4,
    note: "Refined flour base",
  },
  {
    pattern: /\b(palmolein|interesterified|vanaspati)\b/i,
    nutrition: -3,
    note: "Industrial fat base",
  },
  {
    pattern: /\b(invert syrup|glucose syrup|corn syrup|liquid glucose)\b/i,
    nutrition: -3,
    note: "Refined syrup sweetener",
  },
];

function ingredientText(
  ingredientsRaw: string | null,
  attributes: Record<string, string> | null,
): string {
  const parts = [
    ingredientsRaw ?? "",
    attributes?.["Key Features"] ?? "",
    attributes?.["Description"] ?? "",
    attributes?.["Ingredients"] ?? "",
  ];
  return parts.join(" ").toLowerCase();
}

export function scoreIngredientSignals(
  ingredientsRaw: string | null,
  attributes: Record<string, string> | null,
): IngredientSignalResult {
  const text = ingredientText(ingredientsRaw, attributes);
  if (!text.trim()) {
    return { nutritionDelta: 0, labelsDelta: 0, notes: [] };
  }

  let nutritionDelta = 0;
  let labelsDelta = 0;
  let processingPenalty = 0;
  const notes: string[] = [];

  for (const p of PROCESSING_CLASSES) {
    if (!p.pattern.test(text)) continue;
    processingPenalty += p.penalty;
    notes.push(p.note);
  }
  processingPenalty = Math.min(12, processingPenalty);
  nutritionDelta -= processingPenalty;

  for (const p of POSITIVE_SIGNALS) {
    if (!p.pattern.test(text)) continue;
    nutritionDelta += p.nutrition;
    labelsDelta += p.labels;
    notes.push(p.note);
  }

  for (const n of NEGATIVE_BASE) {
    if (!n.pattern.test(text)) continue;
    nutritionDelta += n.nutrition;
    notes.push(n.note);
  }

  if (ingredientsRaw) {
    const commaParts = ingredientsRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (commaParts.length <= 5 && commaParts.length >= 2) {
      nutritionDelta += 2;
      if (!notes.some((x) => x.includes("Short"))) notes.push("Short ingredient list");
    }
  }

  nutritionDelta = Math.max(-14, Math.min(10, Math.round(nutritionDelta)));
  labelsDelta = Math.max(0, Math.min(6, labelsDelta));

  return {
    nutritionDelta,
    labelsDelta,
    notes: [...new Set(notes)].slice(0, 4),
  };
}

/** Soft burden for goal fit (0–~12), not just moderate/hazardous hits. */
export function additiveGoalBurden(ingredientsRaw: string | null): number {
  const matches = matchAdditives(ingredientsRaw);
  let burden = 0;
  for (const m of matches) {
    if (m.tier === "hazardous") burden += 4;
    else if (m.tier === "moderate") burden += 1.5;
    else if (m.tier === "limited") burden += 0.6;
  }
  const proc = scoreIngredientSignals(ingredientsRaw, null);
  burden += Math.min(3, proc.notes.filter((n) => /preserv|emulsif|stabil|artificial/i.test(n)).length * 0.8);
  return burden;
}

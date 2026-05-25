import { parseIngredientsForDisplay } from "@/lib/ingredients/parse";
import { matchAdditives } from "@/lib/scoring/rules";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { SubScores } from "@/lib/supabase/types";

export type HighlightTone = "good" | "warn" | "bad" | "neutral";

export interface AnalysisHighlight {
  label: string;
  value: string;
  caption: string;
  tone: HighlightTone;
}

function toneForSugar(g: number): HighlightTone {
  if (g >= 22) return "bad";
  if (g >= 10) return "warn";
  return "good";
}

function toneForSodium(mg: number): HighlightTone {
  if (mg >= 600) return "bad";
  if (mg >= 300) return "warn";
  return "good";
}

function toneForAdditives(flagged: number, sub?: number): HighlightTone {
  if (flagged > 0 || (sub != null && sub < 20)) return "bad";
  if (sub != null && sub < 28) return "warn";
  return "good";
}

/** Same idea as the homepage “sample analysis” — compact label facts from real product data. */
export function buildAnalysisHighlights(
  nutrition: ProductNutrition | null,
  ingredients_raw: string | null,
  subscores?: SubScores | null,
  max = 4,
): AnalysisHighlight[] {
  const out: AnalysisHighlight[] = [];
  const sugar = nutrition?.sugar_g_100g ?? nutrition?.added_sugar_g_100g;
  const sodium = nutrition?.sodium_mg_100g;
  const kcal = nutrition?.energy_kcal_100g;
  const flagged = parseIngredientsForDisplay(ingredients_raw).filter((i) => i.flagged).length;
  const additiveHits = matchAdditives(ingredients_raw).length;

  if (typeof sugar === "number") {
    out.push({
      label: "Sugar",
      value: `${sugar}g`,
      caption: sugar >= 22 ? "High per 100g" : sugar >= 10 ? "Moderate per 100g" : "Lower per 100g",
      tone: toneForSugar(sugar),
    });
  }

  if (typeof sodium === "number") {
    out.push({
      label: "Sodium",
      value: `${sodium}mg`,
      caption: sodium >= 600 ? "High per 100g" : "Per 100g",
      tone: toneForSodium(sodium),
    });
  }

  const addScore = subscores?.additives;
  out.push({
    label: "Additives",
    value: flagged > 0 ? String(flagged) : additiveHits > 0 ? String(additiveHits) : "0",
    caption:
      flagged > 0
        ? `${flagged} flagged ingredient${flagged > 1 ? "s" : ""}`
        : additiveHits > 0
          ? "Matches in rules table"
          : "No flagged additives",
    tone: toneForAdditives(flagged || additiveHits, addScore),
  });

  if (typeof kcal === "number" && out.length < max) {
    out.push({
      label: "Energy",
      value: `${kcal}`,
      caption: "kcal per 100g",
      tone: kcal >= 450 ? "warn" : "neutral",
    });
  }

  if (subscores && out.length < max) {
    out.push({
      label: "Nutrition",
      value: `${subscores.nutrition}`,
      caption: "of 60 pts",
      tone: subscores.nutrition >= 40 ? "good" : subscores.nutrition >= 25 ? "warn" : "bad",
    });
  }

  return out.slice(0, max);
}

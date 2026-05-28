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
  if (g > 12) return "bad";
  if (g > 5) return "warn";
  return "good";
}

function toneForSodium(mg: number): HighlightTone {
  if (mg > 500) return "bad";
  if (mg > 200) return "warn";
  return "good";
}

function toneForAdditives(count: number): HighlightTone {
  if (count >= 3) return "bad";
  if (count >= 1) return "warn";
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
  const additiveCount = Math.max(flagged, additiveHits);

  if (typeof sugar === "number") {
    out.push({
      label: "Sugar",
      value: `${sugar}g`,
      caption: "",
      tone: toneForSugar(sugar),
    });
  }

  if (typeof sodium === "number") {
    out.push({
      label: "Sodium",
      value: `${sodium}mg`,
      caption: "",
      tone: toneForSodium(sodium),
    });
  }

  out.push({
    label: "Additives",
    value: String(additiveCount),
    caption: "",
    tone: toneForAdditives(additiveCount),
  });

  if (typeof kcal === "number" && out.length < max) {
    out.push({
      label: "Energy",
      value: `${kcal}`,
      caption: "",
      tone: "neutral",
    });
  }

  return out.slice(0, max);
}

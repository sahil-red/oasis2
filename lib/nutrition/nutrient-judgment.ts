/**
 * Per-nutrient judgment — absolute, science-based thresholds (UK FSA front-of-pack
 * style), NOT the within-cohort percentile tiers (those mislabel across categories).
 * One source of truth for both the scannable "judged" summary and the full table.
 */
import type { ResolvedNutritionRow } from "@/lib/nutrition/nutrition-display";

export type NutrientVerdict = {
  kind: "positive" | "limit";
  /** Short chip word, e.g. "High", "Good". */
  label: string;
  /** One-line plain-English explanation. */
  title: string;
};

export const NUTRIENT_VERDICT_COLOR: Record<NutrientVerdict["kind"], string> = {
  positive: "var(--score-excellent)",
  limit: "var(--score-bad)",
};

/** Judge a single resolved row by its per-100g value. null = no notable signal. */
export function judgeNutrientRow(row: ResolvedNutritionRow): NutrientVerdict | null {
  const v = row.per100;
  if (v == null) return null;

  switch (row.id) {
    case "energy_kcal_100g":
      if (v >= 450) return { kind: "limit", label: "high", title: "Calorie-dense — 450+ kcal per 100g." };
      return null;
    case "sugar_g_100g":
      if (v >= 10) return { kind: "limit", label: "high", title: "High sugar — 10g+ per 100g." };
      if (v <= 5) return { kind: "positive", label: "low", title: "Low sugar — 5g or less per 100g." };
      return null;
    case "added_sugar_g_100g":
      if (v >= 10) return { kind: "limit", label: "high", title: "High added sugar per 100g." };
      return null;
    case "saturated_fat_g_100g":
      if (v >= 5) return { kind: "limit", label: "high", title: "High saturated fat — 5g+ per 100g." };
      return null;
    case "trans_fat_g_100g":
      if (v > 0.2) return { kind: "limit", label: "present", title: "Trans fat is present." };
      return null;
    case "sodium_mg_100g":
      if (v >= 400) return { kind: "limit", label: "high", title: "High sodium — 400mg+ per 100g." };
      return null;
    case "fat_g_100g":
      if (v >= 17.5) return { kind: "limit", label: "high", title: "High total fat per 100g." };
      return null;
    case "protein_g_100g":
      if (v >= 12) return { kind: "positive", label: "good", title: "Meaningful protein — 12g+ per 100g." };
      return null;
    case "fiber_g_100g":
      if (v >= 3) return { kind: "positive", label: "good", title: "Source of fibre — 3g+ per 100g." };
      return null;
    default:
      return null;
  }
}

export type JudgedNutrient = {
  id: string;
  label: string;
  per100: number;
  unit: string;
  verdict: NutrientVerdict;
};

/** Notable nutrients only, concerns first (worst-first), then the positives. */
export function judgeNutrition(rows: ResolvedNutritionRow[]): {
  watch: JudgedNutrient[];
  good: JudgedNutrient[];
  headline: string;
} {
  const watch: JudgedNutrient[] = [];
  const good: JudgedNutrient[] = [];
  for (const row of rows) {
    const verdict = judgeNutrientRow(row);
    if (!verdict || row.per100 == null) continue;
    const entry: JudgedNutrient = {
      id: row.id,
      label: row.label,
      per100: row.per100,
      unit: row.unit,
      verdict,
    };
    (verdict.kind === "limit" ? watch : good).push(entry);
  }

  let headline: string;
  if (!watch.length && !good.length) headline = "Nothing notable on the label.";
  else if (!watch.length) headline = "Clean on the numbers that matter.";
  else {
    const concerns = watch.map((w) => w.label === "present" ? w.label : `${w.verdict.label} ${shortName(w.id)}`);
    headline = `Watch the ${humanList(concerns)}.`;
  }
  return { watch, good, headline };
}

function shortName(id: string): string {
  return id
    .replace(/_g_100g$|_mg_100g$|_kcal_100g$|_100g$/, "")
    .replace(/saturated_fat/, "saturated fat")
    .replace(/added_sugar/, "added sugar")
    .replace(/trans_fat/, "trans fat")
    .replace(/energy_kcal/, "calories")
    .replace(/_/g, " ");
}

function humanList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

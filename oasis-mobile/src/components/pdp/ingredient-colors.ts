import type { ThemeColors } from "@/theme";
import type { IngredientItem } from "@/types/api";

export type IngredientRisk =
  | "risk-free"
  | "unknown"
  | "limited"
  | "moderate"
  | "hazardous";

export function dotRiskForItem(item: IngredientItem): IngredientRisk {
  if (item.tier_label === "Probiotic" || item.tier_label.startsWith("Probiotic")) {
    return "risk-free";
  }
  if (item.source === "rules" && item.risk === "risk-free") return "unknown";
  return item.risk as IngredientRisk;
}

export function riskColors(risk: IngredientRisk, colors: ThemeColors) {
  switch (risk) {
    case "risk-free":
      return { dot: colors.good, text: colors.good };
    case "hazardous":
      return { dot: colors.bad, text: colors.bad };
    case "limited":
    case "moderate":
      return { dot: colors.warn, text: colors.warn };
    default:
      return { dot: colors.fgDim, text: colors.fgDim };
  }
}

export function isProbiotic(item: IngredientItem) {
  return item.tier_label === "Probiotic" || item.tier_label.startsWith("Probiotic");
}

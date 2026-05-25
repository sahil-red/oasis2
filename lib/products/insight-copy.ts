import { matchAdditives } from "@/lib/scoring/rules";
import {
  packNutritionContext,
  proteinBudgetGoalFit,
  proteinValueRankScore as proteinRankKey,
} from "@/lib/products/pack-nutrition";
import type { ProductListItem } from "@/lib/products/queries";

export type MarketingCallout = {
  claim: string;
  reality: string;
  tone: "warn" | "neutral";
};

export function marketingCallout(p: ProductListItem): MarketingCallout {
  const score = p.core_scores?.score ?? 0;
  const protein = p.nutrition?.protein_g_100g ?? 0;
  const sugar = p.nutrition?.sugar_g_100g ?? p.nutrition?.added_sugar_g_100g ?? null;
  const name = p.name;

  if (/protein/i.test(name) && protein < 12) {
    return {
      claim: "Marketed as high protein",
      reality: `Only ${protein}g protein per 100g on the label — more snack than functional protein food.`,
      tone: "warn",
    };
  }
  if (/zero sugar|no added sugar|sugar free/i.test(name) && sugar != null && sugar > 8) {
    return {
      claim: "Zero / no added sugar claim",
      reality: `Label still shows ~${sugar}g sugar per 100g — read the table, not just the front.`,
      tone: "warn",
    };
  }
  if (/multigrain|multi grain|atta/i.test(name) && score < 45) {
    return {
      claim: "Sounds wholesome",
      reality: `Core score ${score} — often still mostly refined flour and additives on the ingredient list.`,
      tone: "warn",
    };
  }
  if (/healthy|wellness|nutri/i.test(name) && score < 40) {
    return {
      claim: "Healthy branding",
      reality: `Scores ${score}/100 — marketing runs ahead of what's on the nutrition panel.`,
      tone: "warn",
    };
  }
  return {
    claim: "Health halo on pack",
    reality: `Scores ${score}/100${sugar != null ? ` with ${sugar}g sugar per 100g` : ""} — worth comparing swaps.`,
    tone: "warn",
  };
}

export function proteinPerRupeeLine(p: ProductListItem): string {
  const protein = p.nutrition?.protein_g_100g ?? 0;
  const price = p.price_inr ?? 0;
  const ctx = packNutritionContext({
    nutrition: p.nutrition,
    price_inr: price,
    net_weight: p.net_weight,
  });
  const core = p.core_scores?.score ?? 0;
  if (price <= 0) return `${protein}g protein per 100g`;
  const ppr = (ctx.proteinPerRupee100 ?? 0).toFixed(1);
  if (ctx.usesPack && ctx.proteinInPack != null) {
    return `~${ppr}g protein per ₹100 (${ctx.proteinInPack.toFixed(1)}g in pack) · score ${core}`;
  }
  return `~${ppr}g protein per ₹100 · overall score ${core}`;
}

export function proteinValueBlurb(p: ProductListItem): string {
  const protein = p.nutrition?.protein_g_100g ?? 0;
  const ctx = packNutritionContext({
    nutrition: p.nutrition,
    price_inr: p.price_inr,
    net_weight: p.net_weight,
  });
  const ppr = ctx.proteinPerRupee100 ?? 0;
  const fit = proteinBudgetGoalFit({
    proteinPerRupee100: ppr,
    protein_g_100g: protein,
    core_score: p.core_scores?.score,
  });
  if (ppr >= 25) return `Top-tier protein per ₹100 (~${ppr.toFixed(0)}g) · goal fit ${fit}.`;
  if (ppr >= 15) return `Solid protein per ₹100 (~${ppr.toFixed(0)}g) · goal fit ${fit}.`;
  if (ppr >= 8) return `Moderate value (~${ppr.toFixed(0)}g protein per ₹100).`;
  return "Weak protein value for the price.";
}

export function snackBlurb(p: ProductListItem): string {
  const protein = p.nutrition?.protein_g_100g ?? 0;
  if (protein >= 18) return "Rare high-protein snack in this aisle.";
  if (protein >= 12) return "Decent protein for a packaged snack.";
  return "Snack aisle pick — protein is a bonus, not the main story.";
}

export function isChipStyleSnack(p: ProductListItem): boolean {
  const text = `${p.name} ${p.subcategory ?? ""} ${p.attributes?.Type ?? ""}`.toLowerCase();
  return /\b(chip|crisp|wafer)\b/i.test(text) && !/\b(bar|shake|milk|curd|paneer)\b/i.test(text);
}

export function proteinValueRankScore(p: ProductListItem): number {
  const protein = p.nutrition?.protein_g_100g ?? 0;
  const price = p.price_inr ?? 0;
  const core = p.core_scores?.score ?? 0;
  const ctx = packNutritionContext({
    nutrition: p.nutrition,
    price_inr: price,
    net_weight: p.net_weight,
  });
  if (price <= 0 || protein < 6) return 0;
  const ppr = ctx.proteinPerRupee100 ?? 0;
  if (ppr < 6) return 0;
  let score = proteinRankKey({
    proteinPerRupee100: ppr,
    protein_g_100g: protein,
    core_score: core,
  });
  if (isChipStyleSnack(p)) score *= 0.88;
  return score;
}

export function additiveFlagCount(p: ProductListItem): number {
  return matchAdditives(p.ingredients_raw).filter(
    (m) => m.tier === "moderate" || m.tier === "hazardous",
  ).length;
}

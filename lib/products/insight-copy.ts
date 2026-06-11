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
  const sublabels = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];

  // ── High-precision sublabel-based signals ──

  const hasHiddenSweetener = sublabels.includes("hidden_sweetener");
  const hasHighSugar = sublabels.includes("high_in_sugar") || sublabels.includes("very_high_in_sugar");
  const isUltraProcessed = sublabels.includes("ultra_processed") || sublabels.includes("mostly_nova_4");
  const hasArtificial = sublabels.includes("artificial_flavors");

  // "No added sugar" claim + hidden artificial sweeteners — classic bait-and-switch
  if (/no added sugar|sugar free|zero sugar/i.test(name) && hasHiddenSweetener) {
    return {
      claim: "No added sugar claim",
      reality: `Contains artificial sweeteners (acesulfame, sucralose, etc.) — a common swap, not a reduction.`,
      tone: "warn",
    };
  }

  // High protein claim + low actual protein AND ultra-processed
  if (/protein/i.test(name) && protein < 12 && isUltraProcessed) {
    return {
      claim: "Marketed as high protein",
      reality: `Only ${protein}g protein per 100g — and mostly ultra-processed ingredients.`,
      tone: "warn",
    };
  }

  if (/protein/i.test(name) && protein < 12) {
    return {
      claim: "Marketed as high protein",
      reality: `Only ${protein}g protein per 100g on the label — more snack than functional protein food.`,
      tone: "warn",
    };
  }

  // Multigrain/atta claim + mainly refined flour (ultra-processed or low score)
  if (/multigrain|multi grain|atta/i.test(name) && (isUltraProcessed || score < 45)) {
    return {
      claim: "Sounds wholesome (multigrain / atta claim)",
      reality: isUltraProcessed
        ? `Actually a NOVA 4 ultra-processed product — multigrain is marketing, not nutrition.`
        : `Core score ${score} — often still mostly refined flour and additives on the ingredient list.`,
      tone: "warn",
    };
  }

  // "Healthy" / "natural" branding + ultra-processed reality
  if (/healthy|natural|wellness|nutri/i.test(name) && isUltraProcessed && score < 50) {
    const flags = [];
    if (hasHiddenSweetener) flags.push("hidden sweeteners");
    if (hasHighSugar) flags.push("high sugar");
    if (hasArtificial) flags.push("artificial flavours");
    const flagText = flags.length ? ` with ${flags.join(", ")}` : "";
    return {
      claim: "Healthy / natural branding",
      reality: `Scores ${score}/100 — ultra-processed${flagText}.`,
      tone: "warn",
    };
  }

  // Kids-aisle product + high sugar — dangerous combo
  const kidsAisle = /snack|dairy|bread|cereal|biscuit|chocolate|fruit|milk/i.test(p.category ?? "");
  if (kidsAisle && hasHighSugar) {
    return {
      claim: "Marketed for kids",
      reality: `High in sugar${sugar != null ? ` (${sugar}g per 100g)` : ""} — marketed directly to children despite the sugar load.`,
      tone: "warn",
    };
  }

  // Zero sugar claim but still has significant sugar
  if (/zero sugar|no added sugar|sugar free/i.test(name) && sugar != null && sugar > 8) {
    return {
      claim: "Zero / no added sugar claim",
      reality: `Label still shows ~${sugar}g sugar per 100g — read the table, not just the front.`,
      tone: "warn",
    };
  }

  // Healthy branding + low score (broader catch)
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

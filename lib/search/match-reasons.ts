import { matchAdditives } from "@/lib/scoring/rules";
import { insCodesFromText } from "@/lib/scoring/intelligence-row-resolve";
import { sublabelChipLabels } from "@/lib/scoring/verdict-display";
import { resolveProductVerdict } from "@/lib/scoring/verdict-resolve";
import { VERDICT_LABELS, type VerdictId } from "@/lib/scoring/verdict";
import { productUsecase } from "@/lib/products/catalog-meta";
import type { ProductListItem } from "@/lib/products/queries";
import type { ProductNutrition } from "@/lib/supabase/types";
import { isHighProteinMilkSignal, isMilkAdjacentProduct } from "@/lib/search/milk-intent";
import { isPlantPaneerSubstitute } from "@/lib/search/paneer-intent";
import type { ParsedProductQuery } from "@/lib/search/query-parse";
function wantsNoPreservatives(parsed: ParsedProductQuery): boolean {
  const q = [...parsed.soft_preferences, parsed.explanation, ...parsed.product_terms]
    .join(" ")
    .toLowerCase();
  return /\bno preserv|without preserv|preservative.?free\b/.test(q);
}

function wantsNoAddedSugar(parsed: ParsedProductQuery): boolean {
  const blob = [parsed.explanation, ...parsed.soft_preferences, ...parsed.product_terms]
    .join(" ")
    .toLowerCase();
  return (
    /\bno added sugar\b/.test(blob) ||
    parsed.hard_constraints.max_sugar_g_100g === 1 ||
    parsed.soft_preferences.some((s) => /no added sugar/i.test(s))
  );
}

function preservativeStatus(ingredients: string | null): "clean" | "has" | "unknown" {
  if (!ingredients?.trim()) return "unknown";
  const text = ingredients.toLowerCase();
  if (/\bpreserv/i.test(text)) return "has";
  const codes = insCodesFromText(text);
  if (codes.some((c) => {
    const n = Number(c.replace(/\D/g, ""));
    return n >= 200 && n <= 299;
  })) {
    return "has";
  }
  const hits = matchAdditives(ingredients);
  if (hits.some((h) => h.tier === "moderate" || h.tier === "hazardous")) return "has";
  return "clean";
}

function nutritionValue(
  nutrition: ProductNutrition | null | undefined,
  key: keyof ProductNutrition,
): number | null {
  const v = nutrition?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function ingredientsText(p: ProductListItem): string {
  return (p.ingredients_raw ?? "").toLowerCase();
}

function containsAvoidedIngredient(ingredients: string, avoid: string): boolean {
  const a = avoid.toLowerCase();
  if (a.includes("palm")) return /palm oil|palmolein|palm fat/i.test(ingredients);
  if (a.includes("maida")) return /maida|refined wheat flour/i.test(ingredients);
  return ingredients.includes(a);
}

function additiveSignal(ingredients: string | null | undefined): number {
  if (!ingredients?.trim()) return 0;
  const text = ingredients.toLowerCase();
  let n = 0;
  if (/\bpreserv/i.test(text)) n += 2;
  const codes = insCodesFromText(text);
  if (codes.some((c) => {
    const num = Number(c.replace(/\D/g, ""));
    return num >= 200 && num <= 299;
  })) {
    n += 2;
  }
  n += matchAdditives(ingredients).filter(
    (h) => h.tier === "moderate" || h.tier === "hazardous",
  ).length;
  return n;
}

const POSITIVE_SUBLABELS = new Set([
  "best_in_category",
  "low_sodium",
  "high_in_protein",
  "naturally_fermented",
  "good_for_weight_loss",
  "good_for_gym_goers",
  "fortified_well",
  "mindful_portions",
]);

const WARN_SUBLABELS = new Set([
  "ultra_processed",
  "hazardous_additive",
  "hidden_sweetener",
  "high_in_sugar",
  "very_high_in_sugar",
  "artificial_flavors",
  "trans_fat_present",
  "excessive_sodium",
]);

function verdictChip(p: ProductListItem): string | null {
  const score = p.core_scores?.score;
  if (score == null) return null;
  const id: VerdictId | null = p.core_scores?.verdict
    ? resolveProductVerdict({
        verdict: p.core_scores.verdict,
        score,
        name: p.name,
        category: p.category,
        subcategory: p.subcategory,
      })
    : null;
  if (id) return `Scout ${Math.round(score)} · ${VERDICT_LABELS[id].title}`;
  return `Scout score ${Math.round(score)}`;
}

function termMatchesQuery(label: string, parsed: ParsedProductQuery): boolean {
  const l = label.toLowerCase();
  return parsed.product_terms.some((t) => {
    const tl = t.toLowerCase();
    return l === tl || l.includes(tl);
  });
}

/** Decision-oriented chips for AI search cards (max 3). */
export function buildMatchReasons(p: ProductListItem, parsed: ParsedProductQuery): string[] {
  const reasons: string[] = [];
  const n = p.nutrition;
  const protein = nutritionValue(n, "protein_g_100g");
  const sugar =
    nutritionValue(n, "sugar_g_100g") ?? nutritionValue(n, "added_sugar_g_100g");
  const fat = nutritionValue(n, "fat_g_100g");
  const sodium = nutritionValue(n, "sodium_mg_100g");
  const ing = ingredientsText(p);
  const subs = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];

  for (const avoid of parsed.hard_constraints.avoid_ingredients ?? []) {
    if (!containsAvoidedIngredient(ing, avoid)) {
      if (/palm/i.test(avoid)) reasons.push("No palm oil in ingredients");
      else if (/maida/i.test(avoid)) reasons.push("No maida / refined flour");
      else reasons.push(`No ${avoid}`);
    }
  }

  if (wantsNoPreservatives(parsed)) {
    const status = preservativeStatus(p.ingredients_raw);
    if (status === "clean") reasons.push("No preservatives on label");
  } else if (ing && additiveSignal(p.ingredients_raw) === 0) {
    reasons.push("Cleaner ingredient list");
  }

  if (wantsNoAddedSugar(parsed)) {
    if (sugar != null && sugar <= 1) reasons.push("No added sugar on label");
    else if (!subs.includes("hidden_sweetener") && !subs.includes("high_in_sugar")) {
      reasons.push("Low sugar for category");
    }
  } else if (parsed.hard_constraints.max_sugar_g_100g != null && sugar != null) {
    reasons.push(
      parsed.hard_constraints.max_sugar_g_100g <= 1
        ? "No added sugar on label"
        : `${sugar}g sugar per 100g`,
    );
  }

  if (parsed.soft_preferences.some((s) => /low fat/i.test(s)) && fat != null) {
    reasons.push(`${fat}g fat per 100g`);
  } else if (parsed.hard_constraints.max_fat_g_100g != null && fat != null) {
    reasons.push(`${fat}g fat per 100g`);
  }

  if (
    parsed.product_terms.some((t) => t.toLowerCase() === "milk") &&
    isHighProteinMilkSignal(p)
  ) {
    reasons.push("High-protein milk");
  }
  if (
    parsed.product_terms.some((t) => t.toLowerCase() === "milk") &&
    isMilkAdjacentProduct(p)
  ) {
    reasons.push("Not dairy milk");
  }
  if (parsed.sort_intent === "highest_protein" && protein != null) {
    reasons.push(`${Math.round(protein * 10) / 10}g protein per 100g`);
  } else if (protein != null && protein >= 10) {
    reasons.push(`${Math.round(protein)}g protein per 100g`);
  }

  if (parsed.hard_constraints.vegan) reasons.push("Plant-based / vegan");

  if (
    parsed.product_terms.some((t) => t.toLowerCase() === "paneer") &&
    isPlantPaneerSubstitute(p)
  ) {
    reasons.push("Plant-based paneer alternative");
  }

  for (const id of subs) {
    if (POSITIVE_SUBLABELS.has(id)) {
      const label = sublabelChipLabels([id])[0];
      if (label) reasons.push(label);
    }
  }

  const wantsHealthSignals =
    parsed.health_contexts.length > 0 ||
    parsed.hard_constraints.max_sugar_g_100g != null ||
    (parsed.hard_constraints.avoid_ingredients?.length ?? 0) > 0;
  if (wantsHealthSignals) {
    for (const id of subs) {
      if (WARN_SUBLABELS.has(id)) {
        const label = sublabelChipLabels([id])[0];
        if (label) reasons.push(label);
      }
    }
  }

  if (sodium != null && sodium <= 120 && !reasons.some((r) => /sodium/i.test(r))) {
    if (parsed.health_contexts.includes("diabetic") || parsed.health_contexts.includes("fat_loss")) {
      reasons.push(`${Math.round(sodium)}mg sodium per 100g`);
    }
  }

  const vChip = verdictChip(p);
  if (vChip) reasons.push(vChip);

  const l3 = productUsecase(p);
  if (l3 && !termMatchesQuery(l3, parsed)) reasons.push(l3);

  const unique = [...new Set(reasons)];
  const withoutPrice = unique.filter(
    (r) => !/^₹\d+(\s*—\s*under\s*₹\d+)?$/i.test(r) && !/under ₹\d+/i.test(r),
  );

  if (!withoutPrice.length && p.core_scores?.score != null) {
    return [`Scout score ${Math.round(p.core_scores.score)}`];
  }

  return withoutPrice.slice(0, 3);
}

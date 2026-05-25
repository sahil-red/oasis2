import { additiveGoalBurden, scoreIngredientSignals } from "@/lib/scoring/ingredient-signals";
import type { ProductNutrition } from "@/lib/supabase/types";
import { hasAnimalDerived } from "@/lib/goals/vegan";
import {
  hasEggs,
  hasMeatOrFish,
  vegetarianLabelHint,
} from "@/lib/goals/vegetarian";
import {
  packNutritionContext,
  parsePackGrams,
  scaleFromPer100g,
} from "@/lib/products/pack-nutrition";
import type { GoalId } from "./types";

export type GoalFeatureInput = {
  nutrition: ProductNutrition | null;
  ingredients_raw: string | null;
  price_inr: number | null;
  net_weight?: string | null;
  core_score?: number | null;
  attributes?: Record<string, string> | null;
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  veg_allow_eggs?: boolean;
};

export type GoalFeatures = {
  hasNutrition: boolean;
  protein: number;
  sugar: number;
  addedSugar: number;
  fiber: number;
  kcal: number;
  carbs: number;
  netCarbs: number;
  fat: number;
  saturatedFat: number;
  sodium: number;
  price: number;
  packGrams: number | null;
  packKcal: number | null;
  proteinInPack: number | null;
  proteinPerRupee100: number;
  proteinPer100Kcal: number;
  kcalPerRupee100: number;
  additiveBurden: number;
  processingNotes: string[];
  isSnack: boolean;
  isSweetSnack: boolean;
  isStaple: boolean;
  isProteinSnack: boolean;
  isProteinPowder: boolean;
  isVegLabel: boolean;
  hasMeatOrFish: boolean;
  hasEggs: boolean;
  hasAnimalDerived: boolean;
  allowEggs: boolean;
};

function num(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function text(input: GoalFeatureInput): string {
  return [
    input.name ?? "",
    input.category ?? "",
    input.subcategory ?? "",
    input.attributes?.Type ?? "",
    input.attributes?.["Key Features"] ?? "",
    input.ingredients_raw ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function buildGoalFeatures(input: GoalFeatureInput): GoalFeatures {
  const n = input.nutrition;
  const t = text(input);
  const packGrams = parsePackGrams(input.net_weight);
  const price = input.price_inr ?? 0;
  const protein = num(n?.protein_g_100g);
  const kcal = num(n?.energy_kcal_100g);
  const carbs = num(n?.carbs_g_100g);
  const fiber = num(n?.fiber_g_100g);
  const sugar = num(n?.sugar_g_100g ?? n?.added_sugar_g_100g);
  const addedSugar = num(n?.added_sugar_g_100g ?? n?.sugar_g_100g);
  const fat = num(n?.fat_g_100g);
  const saturatedFat = num(n?.saturated_fat_g_100g);
  const sodium = num(n?.sodium_mg_100g);
  const packCtx = packNutritionContext({
    nutrition: n,
    price_inr: price,
    net_weight: input.net_weight,
  });
  const signals = scoreIngredientSignals(input.ingredients_raw, input.attributes ?? null);

  const proteinInPack =
    packCtx.proteinInPack ??
    (packGrams && protein ? scaleFromPer100g(protein, packGrams) : null);
  const packKcal = packGrams && kcal ? scaleFromPer100g(kcal, packGrams) : null;

  const isSnack = /\b(snack|munch|chip|chips|crisp|crisps|biscuit|cookie|wafer|namkeen|cereal|bar)\b/i.test(t);
  const isSweetSnack =
    isSnack && /\b(choco|chocolate|sweet|cookie|wafer|cereal|bar|candy|cake|munch)\b/i.test(t);
  const isStaple = /\b(atta|flour|dal|pulse|lentil|rice|besan|paneer|tofu|egg|chicken|fish|curd|milk)\b/i.test(t);
  const isProteinPowder = /\b(whey|protein powder|isolate|mass gainer|plant protein)\b/i.test(t);
  const isProteinSnack = isSnack && /\bprotein\b/i.test(t);

  return {
    hasNutrition: n != null && Object.keys(n).length > 0,
    protein,
    sugar,
    addedSugar,
    fiber,
    kcal,
    carbs,
    netCarbs: Math.max(0, carbs - fiber),
    fat,
    saturatedFat,
    sodium,
    price,
    packGrams,
    packKcal,
    proteinInPack,
    proteinPerRupee100: packCtx.proteinPerRupee100 ?? 0,
    proteinPer100Kcal: kcal > 0 ? (protein / kcal) * 100 : 0,
    kcalPerRupee100:
      price > 0 && packKcal != null ? (packKcal / price) * 100 : 0,
    additiveBurden: additiveGoalBurden(input.ingredients_raw),
    processingNotes: signals.notes,
    isSnack,
    isSweetSnack,
    isStaple,
    isProteinSnack,
    isProteinPowder,
    isVegLabel: vegetarianLabelHint(input.attributes ?? null),
    hasMeatOrFish: hasMeatOrFish({
      ingredients_raw: input.ingredients_raw,
      attributes: input.attributes ?? null,
      product_name: input.name ?? null,
    }),
    hasEggs: hasEggs({
      ingredients_raw: input.ingredients_raw,
      attributes: input.attributes ?? null,
    }),
    hasAnimalDerived: hasAnimalDerived({
      ingredients_raw: input.ingredients_raw,
      attributes: input.attributes ?? null,
      product_name: input.name ?? null,
    }),
    allowEggs: input.veg_allow_eggs === true,
  };
}

function fmt(value: number, suffix: string, digits = value < 10 ? 1 : 0): string {
  return `${value.toFixed(digits).replace(/\.0$/, "")}${suffix}`;
}

export function goalPrimaryMetric(goal: GoalId, features: GoalFeatures): string {
  switch (goal) {
    case "gym":
      return features.proteinInPack != null
        ? `${fmt(features.proteinInPack, "g")} protein/pack`
        : `${fmt(features.protein, "g")} protein`;
    case "protein-budget":
      return `${fmt(features.proteinPerRupee100, "g", 1)} protein/₹100`;
    case "bulk":
      return features.packKcal != null
        ? `${Math.round(features.packKcal)} kcal/pack`
        : `${Math.round(features.kcal)} kcal`;
    case "fat-loss":
      return `${Math.round(features.kcal)} kcal · ${fmt(features.proteinPer100Kcal, "g/P100", 1)}`;
    case "diabetic":
    case "pcos":
      return `${fmt(features.netCarbs, "g net carbs")}`;
    case "kids":
      return features.additiveBurden < 0.5
        ? "cleaner label"
        : `${Math.round(features.additiveBurden)} additive load`;
    case "veg":
      return features.hasMeatOrFish ? "not veg" : features.hasEggs ? "has egg" : "veg OK";
    case "vegan":
      return features.hasAnimalDerived ? "not vegan" : "plant OK";
    case "balanced":
    default:
      return features.processingNotes[0] ?? "label score";
  }
}

export function compactReason(reasons: string[], features: GoalFeatures): string {
  if (reasons.length > 0) return reasons[0];
  if (features.processingNotes.length > 0) return features.processingNotes[0];
  if (features.fiber >= 5) return `${fmt(features.fiber, "g fibre")} helps the label`;
  if (features.addedSugar <= 2) return "low added sugar";
  return "based on nutrition + ingredients";
}

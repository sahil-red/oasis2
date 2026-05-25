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
  hasIngredientData: boolean;
  protein: number;
  sugar: number;
  addedSugar: number;
  fiber: number;
  kcal: number;
  carbs: number;
  netCarbs: number;
  fat: number;
  saturatedFat: number;
  transFat: number;
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
  isPuff: boolean;
  isCocoaRich: boolean;
  isSugaryDrink: boolean;
  isFreshProduce: boolean;
  isVegLabel: boolean;
  hasMeatOrFish: boolean;
  hasEggs: boolean;
  hasAnimalDerived: boolean;
  allowEggs: boolean;
  coreScore: number | null;
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

  const transFat = num(n?.trans_fat_g_100g);
  const isSnack = /\b(snack|munch|chip|chips|crisp|crisps|biscuit|cookie|wafer|puff|puffs|namkeen|cereal|bar|bhujia|kurkure|cracker)\b/i.test(t);
  const isSweetSnack =
    isSnack && /\b(choco|chocolate|sweet|cookie|wafer|cereal|bar|candy|cake|munch)\b/i.test(t);
  const isStaple = /\b(atta|flour|dal|pulse|lentil|rice|besan|paneer|tofu|egg|chicken|fish|curd|milk)\b/i.test(t);
  const isProteinPowder = /\b(whey|protein powder|isolate|mass gainer|plant protein)\b/i.test(t);
  const isProteinSnack = isSnack && /\bprotein\b/i.test(t);
  const isPuff = /\b(puff|puffs|kurkure|pipes)\b/i.test(t);
  const isCocoaRich =
    /\b(cacao|cocoa solids|cocoa mass|dark chocolate)\b/i.test(t) ||
    (/\b(chocolate|cocoa)\b/i.test(t) && /\b(7[0-9]|8[0-9]|9[0-9])\s*%/.test(t));
  const isSugaryDrink =
    /\b(cola|soda|soft drink|fizzy|carbonated|drink|beverage|juice|nimbooz|sherbet)\b/i.test(t) &&
    sugar >= 6;
  const isFreshProduce =
    /\b(fresh fruit|fresh vegetable|vegetables)\b/i.test(t) ||
    /(Fresh Fruits|Fresh Vegetables)/i.test(`${input.category ?? ""} ${input.subcategory ?? ""}`);
  const hasIngredientData = ((input.ingredients_raw ?? "").trim().length > 0) || ((input.attributes?.["Ingredients"] ?? "").trim().length > 0);

  return {
    hasNutrition: n != null && Object.keys(n).length > 0,
    hasIngredientData,
    protein,
    sugar,
    addedSugar,
    fiber,
    kcal,
    carbs,
    netCarbs: Math.max(0, carbs - fiber),
    fat,
    saturatedFat,
    transFat,
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
    isPuff,
    isCocoaRich,
    isSugaryDrink,
    isFreshProduce,
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
    coreScore: input.core_score ?? null,
  };
}

/**
 * Short human caption (4-6 words) per goal, generated from product facts.
 * No raw numbers — words first. Used for tile copy, cart rows, and swap cards.
 */
export function goalCaption(goal: GoalId, f: GoalFeatures): string {
  // Hard exclusions first.
  if (goal === "veg" && f.hasMeatOrFish) return "Has meat or fish";
  if (goal === "veg" && !f.allowEggs && f.hasEggs) return "Contains egg";
  if (goal === "vegan" && f.hasAnimalDerived) return "Animal ingredients on label";

  if (!f.hasNutrition && goal !== "veg" && goal !== "vegan") {
    return "No nutrition data";
  }

  switch (goal) {
    case "balanced":
      return balancedCaption(f);
    case "gym":
      return gymCaption(f);
    case "bulk":
      return bulkCaption(f);
    case "fat-loss":
      return fatLossCaption(f);
    case "diabetic":
      return diabeticCaption(f);
    case "pcos":
      return pcosCaption(f);
    case "kids":
      return kidsCaption(f);
    case "protein-budget":
      return proteinBudgetCaption(f);
    case "veg":
      return f.isVegLabel ? "Vegetarian on pack" : "No meat or fish";
    case "vegan":
      return f.isVegLabel && !f.hasAnimalDerived
        ? "Plant-only label"
        : "Looks plant-based";
    default:
      return "Average packaged food";
  }
}

function balancedCaption(f: GoalFeatures): string {
  if (f.transFat > 0.1) return "Contains trans fat";
  if (f.isCocoaRich && f.addedSugar <= 2 && f.sugar <= 8) return "Clean dark chocolate";
  if (f.sodium >= 1200) return "Extremely salty snack";
  if (f.sodium >= 800) return "High-sodium processed food";
  if (f.addedSugar >= 25) return "Loaded with added sugar";
  if (f.sugar >= 22 && !f.isStaple) return "Very high in sugar";
  if (f.isSugaryDrink) return "Sugary fizzy drink";
  if (f.isPuff || (f.isSnack && !f.hasIngredientData && !f.isCocoaRich)) {
    return "Ultra-processed snack";
  }
  if (f.isFreshProduce) return "Fresh whole food";
  if (f.isStaple && f.fiber >= 5) return "Whole-grain staple";
  if (f.isProteinPowder) return "Concentrated protein source";
  if (f.processingNotes.length >= 3) return "Heavily processed label";
  if (f.fiber >= 8) return "Fibre-rich label";
  if (f.protein >= 15 && f.addedSugar < 6) return "Solid protein source";
  if (f.processingNotes[0]) return shortenNote(f.processingNotes[0]);
  if (f.kcal >= 450) return "Calorie-dense food";
  return "Average packaged food";
}

function gymCaption(f: GoalFeatures): string {
  if (f.protein < 4) return "Too little protein";
  if (f.addedSugar >= 18 && f.protein < 15) return "Sugary, low protein";
  if (f.isProteinSnack && f.additiveBurden > 1.5) return "Protein, but processed";
  if (f.protein >= 25) return "High protein density";
  if (f.protein >= 15 && f.addedSugar <= 4) return "Lean protein source";
  if (f.proteinPer100Kcal >= 8 && f.protein >= 10) return "Good protein per calorie";
  if (f.isStaple && f.protein >= 10) return "Solid staple protein";
  if (f.protein >= 10) return "Decent protein label";
  return "Modest protein source";
}

function bulkCaption(f: GoalFeatures): string {
  const core = f.coreScore ?? 50;
  if (f.kcal < 80) return "Too light for bulking";
  if (core < 35 && f.kcal >= 350) return "Cheap empty calories";
  if (f.sodium >= 1000 && f.kcal >= 350) return "Calories but very salty";
  if (f.kcal >= 500 && f.protein >= 14) return "Calorie + protein dense";
  if (f.isCocoaRich && f.kcal >= 400) return "Clean calorie-dense bar";
  if (f.isStaple && f.kcal >= 300 && f.protein >= 10) return "Whole-food bulk staple";
  if (f.kcal >= 400 && f.protein >= 10) return "Solid bulk option";
  if (f.addedSugar >= 18) return "Bulk via cheap sugar";
  if (f.kcal >= 350) return "Calorie dense";
  if (f.protein >= 15) return "Protein, modest calories";
  return "Modest bulk pick";
}

function fatLossCaption(f: GoalFeatures): string {
  if (f.kcal >= 450) return "Too calorie dense";
  if (f.addedSugar >= 15) return "Too sugary for fat loss";
  if (f.kcal < 100 && f.protein >= 6) return "Light + protein-rich";
  if (f.kcal < 60) return "Very low calorie";
  if (f.protein >= 20 && f.kcal < 250) return "Lean protein source";
  if (f.fiber >= 8 && f.addedSugar <= 4) return "Filling, low sugar";
  if (f.isProteinSnack && f.kcal > 360) return "Calorie-heavy protein snack";
  if (f.kcal < 200) return "Lean calorie pick";
  return "Moderate calorie load";
}

function diabeticCaption(f: GoalFeatures): string {
  if (f.addedSugar >= 18) return "Too much added sugar";
  if (f.netCarbs >= 50 && f.fiber < 4) return "Very high net carbs";
  if (f.isSugaryDrink) return "Sugar shock for glucose";
  if (f.isSweetSnack) return "Sweet snack, risky";
  if (f.netCarbs >= 30 && f.fiber < 3) return "Carb-heavy, low fibre";
  if (f.isStaple && f.fiber >= 6) return "Whole-food fibre staple";
  if (f.fiber >= 6 && f.addedSugar <= 2) return "Low sugar, good fibre";
  if (f.addedSugar <= 2 && f.netCarbs < 20) return "Low-carb, low sugar";
  return "Moderate for blood sugar";
}

function pcosCaption(f: GoalFeatures): string {
  if (f.addedSugar >= 15) return "Sugar — bad for PCOS";
  if (f.processingNotes.length >= 3) return "Heavily processed for PCOS";
  if (f.isSweetSnack) return "Sweet snack — limit it";
  if (f.fiber >= 7 && f.addedSugar <= 3) return "Fibre supports insulin";
  if (f.isStaple) return "Whole-food staple";
  if (f.additiveBurden >= 4) return "Lots of additives";
  return "Average for PCOS";
}

function kidsCaption(f: GoalFeatures): string {
  if (f.additiveBurden >= 5) return "Too many additives";
  if (f.processingNotes.some((n) => /artificial/i.test(n))) return "Artificial colours/flavours";
  if (f.addedSugar >= 12) return "High sugar for kids";
  if (f.sodium >= 700) return "Too salty for kids";
  if (!f.hasIngredientData && (f.isSnack || f.isSugaryDrink)) return "Unknown ingredients";
  if (f.isFreshProduce || (f.isStaple && f.additiveBurden < 1)) return "Whole-food staple";
  if (f.additiveBurden < 0.5 && f.addedSugar < 5 && f.sodium < 400) {
    return "Clean kid-friendly";
  }
  return "Average for kids";
}

function proteinBudgetCaption(f: GoalFeatures): string {
  if (f.protein < 6) return "Too little protein";
  if (f.proteinPerRupee100 >= 25) return "Excellent protein value";
  if (f.proteinPerRupee100 >= 15) return "Good protein per rupee";
  if (f.proteinPerRupee100 >= 8) return "Decent protein value";
  if (f.proteinPerRupee100 > 0) return "Expensive for the protein";
  return "Poor protein value";
}

function shortenNote(note: string): string {
  return note
    .replace(/\s+on label$/i, "")
    .replace(/\s*\(.*\)\s*$/, "")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

// Backwards-compatible exports — both return the same short caption now.
export function goalPrimaryMetric(goal: GoalId, features: GoalFeatures): string {
  return goalCaption(goal, features);
}

export function compactReason(_reasons: string[], features: GoalFeatures, goal: GoalId = "balanced"): string {
  return goalCaption(goal, features);
}

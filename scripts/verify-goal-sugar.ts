import { buildGoalFeatures, goalCaption, inferEffectiveSugar } from "@/lib/goals/features";
import { computeGoalFit } from "@/lib/goals/fit";
import type { ProductNutrition } from "@/lib/supabase/types";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const paneerBase = {
  name: "Vijaya Paneer",
  category: "Dairy, Bread & Eggs",
  subcategory: "Fresh Paneer",
  ingredients_raw: "Milk, citric acid",
  price_inr: 90,
  net_weight: "200 g",
  attributes: null as Record<string, string> | null,
  core_score: 80,
};

function runCase(label: string, nutrition: ProductNutrition, extra?: Partial<typeof paneerBase>) {
  const input = { ...paneerBase, ...extra, nutrition };
  const f = buildGoalFeatures(input);
  const pcos = goalCaption("pcos", f);
  const diabetic = goalCaption("diabetic", f);
  const fatLoss = goalCaption("fat-loss", f);
  console.log(`\n[${label}] effectiveAdded=${f.effectiveAddedSugar} pcos="${pcos}" diabetic="${diabetic}" fatLoss="${fatLoss}"`);
  return { f, pcos, diabetic, fatLoss };
}

// Paneer: high carbs in CSV but no sugar on label (the reported bug).
const badCsvPaneer = runCase("paneer bad carbs no sugar field", {
  energy_kcal_100g: 265,
  protein_g_100g: 18,
  carbs_g_100g: 35,
  fat_g_100g: 20,
});
assert(!badCsvPaneer.pcos.includes("Sugar"), "paneer should not get sugar PCOS caption");
assert(badCsvPaneer.pcos === "Whole-food staple", `expected Whole-food staple, got ${badCsvPaneer.pcos}`);

// Explicit 0g sugar on label.
const zeroSugarPaneer = runCase("paneer explicit 0g sugar", {
  energy_kcal_100g: 265,
  protein_g_100g: 18,
  carbs_g_100g: 35,
  sugar_g_100g: 0,
  added_sugar_g_100g: 0,
  fat_g_100g: 20,
});
assert(zeroSugarPaneer.f.effectiveAddedSugar === 0, "explicit zero sugar");
assert(zeroSugarPaneer.pcos === "Whole-food staple", zeroSugarPaneer.pcos);

// Realistic paneer reference values.
const normalPaneer = runCase("paneer normal", {
  energy_kcal_100g: 265,
  protein_g_100g: 18.3,
  carbs_g_100g: 1.2,
  sugar_g_100g: 1.2,
  fat_g_100g: 20.8,
});
assert(normalPaneer.pcos === "Whole-food staple", normalPaneer.pcos);

// Sweet snack without sugar field should still infer.
const cookie = runCase(
  "sweet snack infers sugar",
  {
    energy_kcal_100g: 480,
    protein_g_100g: 6,
    carbs_g_100g: 68,
    fat_g_100g: 22,
  },
  {
    name: "Britannia Good Day Butter Cookie",
    category: "Snacks & Munchies",
    subcategory: "Biscuits",
    ingredients_raw: "Refined wheat flour, sugar, edible vegetable oil",
  },
);
assert(cookie.f.effectiveAddedSugar >= 40, "cookie should infer high sugar");
assert(cookie.pcos.includes("Sugar") || cookie.pcos.includes("Dessert"), cookie.pcos);

// Plain rice — should not infer sugar from starch carbs.
const rice = runCase(
  "rice no sugar inference",
  {
    energy_kcal_100g: 360,
    protein_g_100g: 7,
    carbs_g_100g: 78,
    fat_g_100g: 1,
  },
  {
    name: "India Gate Basmati Rice",
    category: "Atta, Rice & Dal",
    subcategory: "Rice",
    ingredients_raw: "Basmati rice",
  },
);
assert(rice.f.effectiveAddedSugar === 0, "rice should not infer sugar");
assert(!rice.pcos.includes("Sugar"), rice.pcos);

// Juice drink without sugar field.
const inferred = inferEffectiveSugar({
  nutrition: { carbs_g_100g: 12, energy_kcal_100g: 50 },
  isSweetCategory: false,
  isDessert: false,
  isSweetSnack: false,
  ingredients_raw: "Water, orange concentrate",
  name: "Real Fruit Orange Juice",
  category: "Cold Drinks & Juices",
  subcategory: "Juices",
});
assert(inferred.addedSugar > 0, "juice should infer sugar");

console.log("\nAll goal sugar inference checks passed.");

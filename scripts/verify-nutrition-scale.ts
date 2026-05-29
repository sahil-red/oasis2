import { parseServingNutritionBlock } from "@/lib/grocery/parse-nutrition-block";
import { tryCorrectNutrition, sanitizeNutrition } from "@/lib/nutrition/anomaly";
import { reconcileNutrition } from "@/lib/nutrition/sanity";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Per-100g block must not be halved when pack is 200g.
const per100Block = [
  "Energy (kcal)\t62",
  "Protein (g)\t18",
  "Carbohydrate (g)\t3",
  "Fat (g)\t20",
].join("\n");
const wronglyScaled = parseServingNutritionBlock(per100Block, 200);
assert(
  wronglyScaled?.energy_kcal_100g === 62,
  `expected 62 kcal, got ${wronglyScaled?.energy_kcal_100g}`,
);

const per100Explicit = parseServingNutritionBlock("Per 100gm\n" + per100Block);
assert(per100Explicit?.energy_kcal_100g === 62, "per 100gm header");

const per30Serve = parseServingNutritionBlock("Per 30g\nEnergy (kcal)\t19\nProtein (g)\t5.4");
assert(
  per30Serve?.energy_kcal_100g != null && per30Serve.energy_kcal_100g >= 60,
  `30g serve should scale up, got ${per30Serve?.energy_kcal_100g}`,
);

const ctx = {
  name: "Milky Mist Briyas Tofu Paneer",
  category: "Dairy, Bread & Eggs",
  subcategory: "Fresh Paneer",
};

const perServeMisstored = {
  energy_kcal_100g: 31,
  protein_g_100g: 18,
  fat_g_100g: 14,
  carbs_g_100g: 3,
  source: "platform" as const,
};
const fixed = tryCorrectNutrition(perServeMisstored, ctx);
assert(
  fixed != null && (fixed.energy_kcal_100g ?? 0) >= 90,
  `low energy column should correct, got ${fixed?.energy_kcal_100g}`,
);

const reconciled = reconcileNutrition({
  nutrition: { energy_kcal_100g: 180, protein_g_100g: 18, carbs_g_100g: 3, fat_g_100g: 14, source: "platform" },
  attributes: { "Nutrition Information": per100Block },
  ...ctx,
  net_weight: "200 g",
});
assert(
  (reconciled?.energy_kcal_100g ?? 0) >= 60,
  `reconcile should keep plausible CSV energy, got ${reconciled?.energy_kcal_100g}`,
);

const sanitized = sanitizeNutrition(
  { energy_kcal_100g: 31, protein_g_100g: 18, fat_g_100g: 14, carbs_g_100g: 3, source: "platform" },
  ctx,
);
assert(
  sanitized != null && (sanitized.energy_kcal_100g ?? 0) >= 90,
  `sanitize should fix tofu paneer energy, got ${sanitized?.energy_kcal_100g}`,
);

console.log("All nutrition scale checks passed.");

const akshaya = reconcileNutrition({
  nutrition: {
    source: "label",
    fat_g_100g: 80,
    sugar_g_100g: 0.09,
    sodium_mg_100g: 17.4,
  },
  attributes: null,
  name: "Akshayakalpa Organic Malai Paneer",
  category: "Dairy, Bread & Eggs",
  subcategory: "Paneer & Cream",
});
assert((akshaya?.energy_kcal_100g ?? 0) > 100, "Akshayakalpa should get energy from gap fill");
assert((akshaya?.protein_g_100g ?? 0) > 10, "Akshayakalpa should get protein from gap fill");
assert(akshaya?.fat_g_100g === 8, "Akshayakalpa fat should be decimal-corrected to 8g");

console.log("Akshayakalpa paneer gap-fill checks passed.");

/**
 * Curated override dictionary for common Indian grocery ingredients.
 *
 * These entries ALWAYS override LLM output — no model hallucination possible.
 * Priority: known > lm. Add new entries here rather than patching the LLM prompt.
 *
 * NOVA scale:
 *   1 = unprocessed / minimally processed (whole foods, dried, ground)
 *   2 = processed culinary ingredient (oils, sugar, salt, butter, flour)
 *   3 = processed food (tinned veg, cheese, cured meats)
 *   4 = ultra-processed (additives, emulsifiers, colorants, reconstructed foods)
 *
 * concern_tier: innocuous | watchful | problematic | hazardous
 */

import type { IngredientIntelligenceRow } from "@/lib/scoring/ingredient-llm";

export type KnownIngredient = Omit<IngredientIntelligenceRow, "synonyms"> & {
  synonyms?: string[];
};

/** Canonical map keyed by normalized_name (lowercase, trimmed). */
export const KNOWN_INGREDIENTS: Record<string, KnownIngredient> = {
  // ──────────── MINERALS & SALTS ────────────
  salt: { normalized_name: "salt", display_name: "Salt", nova_class: 1, role: "flavor", concern_tier: "watchful", concern_reasons: ["High sodium; limit if hypertensive or sodium-sensitive"], intrinsic_quality: 60, synonyms: ["common salt", "table salt", "sea salt", "rock salt"] },
  "iodized salt": { normalized_name: "iodized salt", display_name: "Iodized Salt", nova_class: 1, role: "flavor", concern_tier: "watchful", concern_reasons: ["High sodium"], intrinsic_quality: 65 },
  "sea salt": { normalized_name: "sea salt", display_name: "Sea Salt", nova_class: 1, role: "flavor", concern_tier: "watchful", concern_reasons: ["High sodium"], intrinsic_quality: 60 },
  "rock salt": { normalized_name: "rock salt", display_name: "Rock Salt", nova_class: 1, role: "flavor", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 65 },

  // ──────────── NATURAL SUGARS & SWEETENERS ────────────
  sugar: { normalized_name: "sugar", display_name: "Sugar", nova_class: 2, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Refined sugar; contributes to blood sugar spikes and excess calories"], intrinsic_quality: 25 },
  "cane sugar": { normalized_name: "cane sugar", display_name: "Cane Sugar", nova_class: 2, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Refined sugar"], intrinsic_quality: 30 },
  "brown sugar": { normalized_name: "brown sugar", display_name: "Brown Sugar", nova_class: 2, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Refined sugar; marginally more minerals than white sugar"], intrinsic_quality: 30 },
  jaggery: { normalized_name: "jaggery", display_name: "Jaggery", nova_class: 2, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Natural unrefined sugar; contains minerals but still raises blood sugar"], intrinsic_quality: 45 },
  honey: { normalized_name: "honey", display_name: "Honey", nova_class: 1, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Natural sugar; high fructose content"], intrinsic_quality: 55 },
  "coconut sugar": { normalized_name: "coconut sugar", display_name: "Coconut Sugar", nova_class: 2, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Unrefined sugar; lower GI than cane sugar but still a free sugar"], intrinsic_quality: 45 },
  "date sugar": { normalized_name: "date sugar", display_name: "Date Sugar", nova_class: 1, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Whole food sugar; retains fiber and minerals"], intrinsic_quality: 60 },
  "maple syrup": { normalized_name: "maple syrup", display_name: "Maple Syrup", nova_class: 1, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Natural sugar with trace minerals"], intrinsic_quality: 55 },
  "invert sugar": { normalized_name: "invert sugar", display_name: "Invert Sugar", nova_class: 3, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Processed sugar with high fructose content"], intrinsic_quality: 20 },
  "glucose syrup": { normalized_name: "glucose syrup", display_name: "Glucose Syrup", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Highly refined starch-derived syrup; rapidly raises blood sugar"], intrinsic_quality: 15 },
  "liquid glucose": { normalized_name: "liquid glucose", display_name: "Liquid Glucose", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Highly refined glucose syrup"], intrinsic_quality: 15 },
  "corn syrup": { normalized_name: "corn syrup", display_name: "Corn Syrup", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Refined corn-derived syrup"], intrinsic_quality: 15 },
  "high fructose corn syrup": { normalized_name: "high fructose corn syrup", display_name: "High Fructose Corn Syrup", nova_class: 4, role: "sweetener", concern_tier: "problematic", concern_reasons: ["Ultra-processed; strongly linked to metabolic disorders", "High fructose bypasses satiety signals"], intrinsic_quality: 5 },

  // ──────────── SUGAR ALCOHOLS ────────────
  maltitol: { normalized_name: "maltitol", display_name: "Maltitol", nova_class: 2, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Polyol; can cause bloating and laxative effect in sensitive individuals"], intrinsic_quality: 45 },
  sorbitol: { normalized_name: "sorbitol", display_name: "Sorbitol (E420)", nova_class: 3, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Sugar alcohol; laxative effect above 20g/day"], intrinsic_quality: 50 },
  xylitol: { normalized_name: "xylitol", display_name: "Xylitol", nova_class: 3, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Sugar alcohol; generally tolerated; toxic to dogs"], intrinsic_quality: 55 },
  erythritol: { normalized_name: "erythritol", display_name: "Erythritol", nova_class: 3, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Polyol; may cause digestive discomfort in FODMAP-sensitive individuals"], intrinsic_quality: 50 },
  mannitol: { normalized_name: "mannitol", display_name: "Mannitol (E421)", nova_class: 3, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Sugar alcohol; laxative effect at high doses"], intrinsic_quality: 50 },

  // ──────────── ARTIFICIAL / INTENSE SWEETENERS ────────────
  stevia: { normalized_name: "stevia", display_name: "Stevia", nova_class: 1, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Plant-derived; long-term safety data limited"], intrinsic_quality: 65 },
  "steviol glycosides": { normalized_name: "steviol glycosides", display_name: "Steviol Glycosides (E960)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Extracted sweetener; generally regarded as safe"], intrinsic_quality: 60 },
  "sucralose": { normalized_name: "sucralose", display_name: "Sucralose (E955)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Synthetic sweetener; may affect gut microbiome at high doses"], intrinsic_quality: 35 },
  "acesulfame potassium": { normalized_name: "acesulfame potassium", display_name: "Acesulfame-K (E950)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Synthetic sweetener; often paired with aspartame"], intrinsic_quality: 35 },
  "acesulfame k": { normalized_name: "acesulfame k", display_name: "Acesulfame-K (E950)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Synthetic sweetener"], intrinsic_quality: 35 },
  aspartame: { normalized_name: "aspartame", display_name: "Aspartame (E951)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Synthetic sweetener; avoid in phenylketonuria (PKU)", "IARC Group 2B (possibly carcinogenic at high doses)"], intrinsic_quality: 30 },
  saccharin: { normalized_name: "saccharin", display_name: "Saccharin (E954)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Oldest synthetic sweetener; bladder cancer concerns in animal studies"], intrinsic_quality: 25 },
  "neotame": { normalized_name: "neotame", display_name: "Neotame (E961)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Synthetic sweetener; derivative of aspartame"], intrinsic_quality: 35 },

  // ──────────── PREBIOTIC / FIBER ADDITIVES ────────────
  fructooligosaccharides: { normalized_name: "fructooligosaccharides", display_name: "FOS (Fructooligosaccharides)", nova_class: 1, role: "probiotic", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 80 },
  fos: { normalized_name: "fos", display_name: "FOS (Prebiotic fiber)", nova_class: 1, role: "probiotic", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 80 },
  inulin: { normalized_name: "inulin", display_name: "Inulin (Prebiotic fiber)", nova_class: 1, role: "probiotic", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 80 },
  "chicory root fiber": { normalized_name: "chicory root fiber", display_name: "Chicory Root Fiber", nova_class: 1, role: "probiotic", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 80 },
  "chicory inulin": { normalized_name: "chicory inulin", display_name: "Chicory Inulin (Prebiotic)", nova_class: 1, role: "probiotic", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 80 },
  polydextrose: { normalized_name: "polydextrose", display_name: "Polydextrose (E1200)", nova_class: 4, role: "starch", concern_tier: "watchful", concern_reasons: ["Synthetic polymer bulking agent; no nutritional value"], intrinsic_quality: 30 },

  // ──────────── FLOURS & STARCHES ────────────
  "whole wheat flour": { normalized_name: "whole wheat flour", display_name: "Whole Wheat Flour", nova_class: 1, role: "starch", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 70 },
  "wheat flour": { normalized_name: "wheat flour", display_name: "Wheat Flour", nova_class: 2, role: "starch", concern_tier: "watchful", concern_reasons: ["Refined; low in fiber unless whole grain"], intrinsic_quality: 50 },
  maida: { normalized_name: "maida", display_name: "Maida (Refined Wheat Flour)", nova_class: 4, role: "starch", concern_tier: "watchful", concern_reasons: ["Highly refined flour; stripped of fiber and nutrients", "High glycemic index"], intrinsic_quality: 20 },
  "refined wheat flour": { normalized_name: "refined wheat flour", display_name: "Refined Wheat Flour", nova_class: 4, role: "starch", concern_tier: "watchful", concern_reasons: ["Highly refined; high glycemic index, low fiber"], intrinsic_quality: 20 },
  "atta": { normalized_name: "atta", display_name: "Atta (Whole Wheat)", nova_class: 1, role: "starch", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 75 },
  cornstarch: { normalized_name: "cornstarch", display_name: "Cornstarch", nova_class: 2, role: "starch", concern_tier: "watchful", concern_reasons: ["Refined starch; high glycemic index"], intrinsic_quality: 35 },
  "modified starch": { normalized_name: "modified starch", display_name: "Modified Starch", nova_class: 4, role: "starch", concern_tier: "watchful", concern_reasons: ["Chemically or physically altered starch"], intrinsic_quality: 35 },
  "tapioca starch": { normalized_name: "tapioca starch", display_name: "Tapioca Starch", nova_class: 2, role: "starch", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 45 },
  "rice flour": { normalized_name: "rice flour", display_name: "Rice Flour", nova_class: 1, role: "starch", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 55 },

  // ──────────── OILS & FATS ────────────
  "palm oil": { normalized_name: "palm oil", display_name: "Palm Oil", nova_class: 2, role: "fat", concern_tier: "watchful", concern_reasons: ["High in saturated fat; environmental concerns"], intrinsic_quality: 35 },
  "palm kernel oil": { normalized_name: "palm kernel oil", display_name: "Palm Kernel Oil", nova_class: 2, role: "fat", concern_tier: "watchful", concern_reasons: ["Very high in saturated fat (~80%)"], intrinsic_quality: 25 },
  "coconut oil": { normalized_name: "coconut oil", display_name: "Coconut Oil", nova_class: 2, role: "fat", concern_tier: "watchful", concern_reasons: ["High in saturated fat; medium-chain triglycerides have some benefits"], intrinsic_quality: 55 },
  "sunflower oil": { normalized_name: "sunflower oil", display_name: "Sunflower Oil", nova_class: 2, role: "fat", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 60 },
  "soybean oil": { normalized_name: "soybean oil", display_name: "Soybean Oil", nova_class: 2, role: "fat", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 55 },
  "mustard oil": { normalized_name: "mustard oil", display_name: "Mustard Oil", nova_class: 2, role: "fat", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 65 },
  "groundnut oil": { normalized_name: "groundnut oil", display_name: "Groundnut Oil", nova_class: 2, role: "fat", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 60 },
  ghee: { normalized_name: "ghee", display_name: "Ghee", nova_class: 1, role: "fat", concern_tier: "watchful", concern_reasons: ["High in saturated fat; small amounts are traditional and acceptable"], intrinsic_quality: 65 },
  butter: { normalized_name: "butter", display_name: "Butter", nova_class: 1, role: "fat", concern_tier: "watchful", concern_reasons: ["High in saturated fat"], intrinsic_quality: 60 },
  "hydrogenated vegetable fat": { normalized_name: "hydrogenated vegetable fat", display_name: "Hydrogenated Vegetable Fat", nova_class: 4, role: "fat", concern_tier: "problematic", concern_reasons: ["Contains trans fats; associated with cardiovascular disease risk"], intrinsic_quality: 10 },
  "partially hydrogenated": { normalized_name: "partially hydrogenated", display_name: "Partially Hydrogenated Fat", nova_class: 4, role: "fat", concern_tier: "problematic", concern_reasons: ["Trans fat source; cardiovascular risk"], intrinsic_quality: 5 },

  // ──────────── COMMON EMULSIFIERS ────────────
  "soy lecithin": { normalized_name: "soy lecithin", display_name: "Soy Lecithin (E322)", nova_class: 4, role: "emulsifier", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 55 },
  lecithin: { normalized_name: "lecithin", display_name: "Lecithin (E322)", nova_class: 4, role: "emulsifier", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 55 },
  "sunflower lecithin": { normalized_name: "sunflower lecithin", display_name: "Sunflower Lecithin (E322)", nova_class: 4, role: "emulsifier", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 60 },
  "mono and diglycerides": { normalized_name: "mono and diglycerides", display_name: "Mono- and Diglycerides (E471)", nova_class: 4, role: "emulsifier", concern_tier: "watchful", concern_reasons: ["Partially synthetic emulsifier; may contain small amounts of trans fat"], intrinsic_quality: 35 },

  // ──────────── PRESERVATIVES ────────────
  "sodium benzoate": { normalized_name: "sodium benzoate", display_name: "Sodium Benzoate (E211)", nova_class: 4, role: "preservative", concern_tier: "watchful", concern_reasons: ["Reacts with vitamin C to form benzene; limit intake"], intrinsic_quality: 30 },
  "potassium sorbate": { normalized_name: "potassium sorbate", display_name: "Potassium Sorbate (E202)", nova_class: 4, role: "preservative", concern_tier: "watchful", concern_reasons: ["Synthetic preservative; generally regarded as safe at approved levels"], intrinsic_quality: 40 },
  "sodium metabisulphite": { normalized_name: "sodium metabisulphite", display_name: "Sodium Metabisulphite (E223)", nova_class: 4, role: "preservative", concern_tier: "watchful", concern_reasons: ["Sulphite; can trigger asthma or allergic reactions in sensitive individuals"], intrinsic_quality: 35 },
  "sodium metabisulfite": { normalized_name: "sodium metabisulfite", display_name: "Sodium Metabisulphite (E223)", nova_class: 4, role: "preservative", concern_tier: "watchful", concern_reasons: ["Sulphite; can trigger reactions in sulphite-sensitive individuals"], intrinsic_quality: 35 },

  // ──────────── ARTIFICIAL COLORS ────────────
  tartrazine: { normalized_name: "tartrazine", display_name: "Tartrazine (E102)", nova_class: 4, role: "color", concern_tier: "watchful", concern_reasons: ["Synthetic azo dye; may cause hyperactivity in children"], intrinsic_quality: 30 },
  "sunset yellow": { normalized_name: "sunset yellow", display_name: "Sunset Yellow (E110)", nova_class: 4, role: "color", concern_tier: "watchful", concern_reasons: ["Synthetic azo dye; restricted in some countries"], intrinsic_quality: 30 },
  carmoisine: { normalized_name: "carmoisine", display_name: "Carmoisine (E122)", nova_class: 4, role: "color", concern_tier: "watchful", concern_reasons: ["Synthetic azo dye; may cause allergic reactions"], intrinsic_quality: 30 },
  "allura red": { normalized_name: "allura red", display_name: "Allura Red (E129)", nova_class: 4, role: "color", concern_tier: "watchful", concern_reasons: ["Synthetic azo dye; restricted in EU for children"], intrinsic_quality: 30 },
  "brilliant blue": { normalized_name: "brilliant blue", display_name: "Brilliant Blue (E133)", nova_class: 4, role: "color", concern_tier: "watchful", concern_reasons: ["Synthetic dye; generally regarded as safe"], intrinsic_quality: 35 },
  "ammonia caramel": { normalized_name: "ammonia caramel", display_name: "Ammonia Caramel (E150c)", nova_class: 4, role: "color", concern_tier: "watchful", concern_reasons: ["Synthetic caramel colour; may contain 4-MEI by-product"], intrinsic_quality: 35 },

  // ──────────── COMMON WHOLE FOODS ────────────
  water: { normalized_name: "water", display_name: "Water", nova_class: 1, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 100 },
  milk: { normalized_name: "milk", display_name: "Milk", nova_class: 1, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 80 },
  "skimmed milk": { normalized_name: "skimmed milk", display_name: "Skimmed Milk", nova_class: 1, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 78 },
  "milk solids": { normalized_name: "milk solids", display_name: "Milk Solids", nova_class: 2, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 72 },
  "milk powder": { normalized_name: "milk powder", display_name: "Milk Powder", nova_class: 2, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 70 },
  "cocoa solids": { normalized_name: "cocoa solids", display_name: "Cocoa Solids", nova_class: 1, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 85 },
  "cocoa butter": { normalized_name: "cocoa butter", display_name: "Cocoa Butter", nova_class: 1, role: "fat", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 80 },
  "cocoa powder": { normalized_name: "cocoa powder", display_name: "Cocoa Powder", nova_class: 1, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 85 },
  chocolate: { normalized_name: "chocolate", display_name: "Chocolate", nova_class: 3, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 60 },
  "dark chocolate": { normalized_name: "dark chocolate", display_name: "Dark Chocolate", nova_class: 3, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 70 },
  oats: { normalized_name: "oats", display_name: "Oats", nova_class: 1, role: "starch", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 88 },
  "rolled oats": { normalized_name: "rolled oats", display_name: "Rolled Oats", nova_class: 1, role: "starch", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 88 },
  rice: { normalized_name: "rice", display_name: "Rice", nova_class: 1, role: "starch", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 70 },
  "basmati rice": { normalized_name: "basmati rice", display_name: "Basmati Rice", nova_class: 1, role: "starch", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 75 },
  wheat: { normalized_name: "wheat", display_name: "Wheat", nova_class: 1, role: "starch", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 68 },
  "almonds": { normalized_name: "almonds", display_name: "Almonds", nova_class: 1, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 92 },
  "almond butter": { normalized_name: "almond butter", display_name: "Almond Butter", nova_class: 1, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 88 },
  cashews: { normalized_name: "cashews", display_name: "Cashews", nova_class: 1, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 88 },
  peanuts: { normalized_name: "peanuts", display_name: "Peanuts", nova_class: 1, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 82 },
  "peanut butter": { normalized_name: "peanut butter", display_name: "Peanut Butter", nova_class: 2, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 78 },
  eggs: { normalized_name: "eggs", display_name: "Eggs", nova_class: 1, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 92 },

  // ──────────── SOY & PLANT PROTEINS ────────────
  // One canonical identity for the whole soy-food family. Soya chunks/flour/granules/
  // protein are all the same wholesome plant protein — they must score identically
  // regardless of how the label phrases it. (Soybean OIL and soy LECITHIN are distinct
  // roles and keep their own entries above.)
  soy: { normalized_name: "soy", display_name: "Soy", nova_class: 2, role: "base_food", concern_tier: "innocuous", concern_reasons: ["Complete plant protein"], intrinsic_quality: 85, synonyms: ["soya", "soybean", "soybeans", "soy bean", "soya bean", "soy beans", "soya beans", "defatted soy", "defatted soya", "defatted soy flour", "defatted soya flour", "soy flour", "soya flour", "soy chunks", "soya chunks", "soy chunk", "soya chunk", "soy nuggets", "soya nuggets", "soya bari", "soy granules", "soya granules", "soy grit", "soya grit", "soy grits", "soya grits", "soy flakes", "soya flakes", "textured soy protein", "textured soya protein", "textured vegetable protein", "tvp", "soy protein", "soya protein", "soy protein isolate", "soya protein isolate", "isolated soy protein", "isolated soya protein", "soy protein concentrate", "soya protein concentrate", "soy concentrate", "hydrolysed soy protein", "hydrolysed soya protein", "hydrolyzed soy protein", "edible soya", "edible soybean", "soya extract", "soy bean extract"] },
  "pea protein": { normalized_name: "pea protein", display_name: "Pea Protein", nova_class: 3, role: "base_food", concern_tier: "innocuous", concern_reasons: ["Plant protein"], intrinsic_quality: 80, synonyms: ["pea protein isolate", "pea protein concentrate", "isolated pea protein", "yellow pea protein"] },
  "whey protein": { normalized_name: "whey protein", display_name: "Whey Protein", nova_class: 3, role: "base_food", concern_tier: "innocuous", concern_reasons: ["Dairy protein"], intrinsic_quality: 75, synonyms: ["whey protein concentrate", "whey protein isolate", "whey protein hydrolysate", "isolated whey protein", "whey concentrate", "whey isolate"] },
  whey: { normalized_name: "whey", display_name: "Whey", nova_class: 2, role: "base_food", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 65, synonyms: ["whey solids", "demineralised whey", "sweet whey", "whey powder"] },

  // ──────────── GENERIC REFINED OIL (unspecified "edible vegetable oil") ────────────
  "vegetable oil": { normalized_name: "vegetable oil", display_name: "Refined Vegetable Oil", nova_class: 2, role: "fat", concern_tier: "watchful", concern_reasons: ["Unspecified refined oil; often palm or a blend high in saturated fat"], intrinsic_quality: 40, synonyms: ["edible vegetable oil", "refined vegetable oil", "edible oil", "refined oil", "vegetable fat", "edible vegetable fat", "edible refined oil"] },

  // ──────────── E-number aliases (bare numbers resolve to named entries) ────────────
  // Sweeteners
  "950": { normalized_name: "950", display_name: "Acesulfame Potassium (E950)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Synthetic sweetener; often paired with aspartame"], intrinsic_quality: 35 },
  "951": { normalized_name: "951", display_name: "Aspartame (E951)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Synthetic sweetener; avoid in PKU"], intrinsic_quality: 30 },
  "954": { normalized_name: "954", display_name: "Saccharin (E954)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Oldest synthetic sweetener"], intrinsic_quality: 25 },
  "955": { normalized_name: "955", display_name: "Sucralose (E955)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Synthetic sweetener; may affect gut microbiome"], intrinsic_quality: 35 },
  "960": { normalized_name: "960", display_name: "Steviol Glycosides (E960)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Extracted sweetener"], intrinsic_quality: 60 },
  "961": { normalized_name: "961", display_name: "Neotame (E961)", nova_class: 4, role: "sweetener", concern_tier: "watchful", concern_reasons: ["Synthetic sweetener"], intrinsic_quality: 35 },
  // Preservatives
  "202": { normalized_name: "202", display_name: "Potassium Sorbate (E202)", nova_class: 4, role: "preservative", concern_tier: "watchful", concern_reasons: ["Synthetic preservative"], intrinsic_quality: 40 },
  "211": { normalized_name: "211", display_name: "Sodium Benzoate (E211)", nova_class: 4, role: "preservative", concern_tier: "watchful", concern_reasons: ["Reacts with vitamin C to form benzene"], intrinsic_quality: 30 },
  "223": { normalized_name: "223", display_name: "Sodium Metabisulphite (E223)", nova_class: 4, role: "preservative", concern_tier: "watchful", concern_reasons: ["Sulphite; can trigger asthma"], intrinsic_quality: 35 },
  // Colors
  "102": { normalized_name: "102", display_name: "Tartrazine (E102)", nova_class: 4, role: "color", concern_tier: "watchful", concern_reasons: ["Synthetic azo dye"], intrinsic_quality: 30 },
  "110": { normalized_name: "110", display_name: "Sunset Yellow (E110)", nova_class: 4, role: "color", concern_tier: "watchful", concern_reasons: ["Synthetic azo dye"], intrinsic_quality: 30 },
  "122": { normalized_name: "122", display_name: "Carmoisine (E122)", nova_class: 4, role: "color", concern_tier: "watchful", concern_reasons: ["Synthetic azo dye"], intrinsic_quality: 30 },
  "129": { normalized_name: "129", display_name: "Allura Red (E129)", nova_class: 4, role: "color", concern_tier: "watchful", concern_reasons: ["Synthetic azo dye"], intrinsic_quality: 30 },
  "133": { normalized_name: "133", display_name: "Brilliant Blue (E133)", nova_class: 4, role: "color", concern_tier: "watchful", concern_reasons: ["Synthetic dye"], intrinsic_quality: 35 },
  // Emulsifiers
  "322": { normalized_name: "322", display_name: "Lecithin (E322)", nova_class: 4, role: "emulsifier", concern_tier: "innocuous", concern_reasons: [], intrinsic_quality: 55 },
  "471": { normalized_name: "471", display_name: "Mono- and Diglycerides (E471)", nova_class: 4, role: "emulsifier", concern_tier: "watchful", concern_reasons: ["Partially synthetic"], intrinsic_quality: 35 },
  // Starch
  "621": { normalized_name: "621", display_name: "MSG / Monosodium Glutamate (E621)", nova_class: 4, role: "flavor", concern_tier: "watchful", concern_reasons: ["Linked to headache in sensitive individuals"], intrinsic_quality: 40 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Canonical synonym resolution — the consistency lever
// ─────────────────────────────────────────────────────────────────────────────
// Index every known ingredient by its canonical name AND each synonym, so a raw
// label string ("soya chunks", "defatted soy flour", "soybean") resolves to ONE
// authoritative rating instead of letting each phrasing get an independent (and
// divergent) LLM score. This is what makes two soya-chunk products with the same
// nutrition score the same. Built once at module load.
const SYNONYM_INDEX: Map<string, KnownIngredient> = (() => {
  const m = new Map<string, KnownIngredient>();
  for (const entry of Object.values(KNOWN_INGREDIENTS)) {
    m.set(entry.normalized_name, entry);
    for (const s of entry.synonyms ?? []) {
      const k = s.toLowerCase().trim();
      if (k && !m.has(k)) m.set(k, entry);
    }
  }
  return m;
})();

// Leading qualifiers that NEVER change an ingredient's scoring identity. Kept
// deliberately conservative — words that DO matter (refined, whole, defatted,
// hydrogenated) are excluded so e.g. "refined wheat flour" never collapses into
// "wheat flour". Those distinctions live as explicit entries/synonyms instead.
const STRIP_QUALIFIER = /^(?:edible|raw|organic|natural|pure|fresh|premium|imported|sortex|cleaned|good\s+quality)\s+/;

/** Resolve a raw/normalized ingredient name to its authoritative canonical entry
 *  via the synonym index (synonym-aware, percentage/parenthetical-tolerant). */
export function resolveKnownCanonical(name: string): KnownIngredient | null {
  let n = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // drop "(100%)" / "(e322)" / "(defatted)"
    .replace(/\s*\d+(?:\.\d+)?\s*%/g, " ") // drop percentages
    .replace(/[.,;:*&\[\]{}()'"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return null;
  const direct = SYNONYM_INDEX.get(n);
  if (direct) return direct;
  let prev = "";
  while (n !== prev && STRIP_QUALIFIER.test(n)) {
    prev = n;
    n = n.replace(STRIP_QUALIFIER, "").trim();
    const hit = SYNONYM_INDEX.get(n);
    if (hit) return hit;
  }
  return null;
}

/**
 * Look up a known ingredient by name (synonym-aware).
 * Returns the curated canonical row or null if not in the dictionary.
 */
export function getKnownIngredient(normalizedName: string): KnownIngredient | null {
  return resolveKnownCanonical(normalizedName);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ingredient role → name expansion (used by ingredientPresent for avoid filters)
// ─────────────────────────────────────────────────────────────────────────────

/** Maps an avoid-term umbrella category to ingredient role + filters.
 *  When the LLM sets avoid_ingredients:["artificial sweetener"], ingredientPresent
 *  expands it to every known ingredient name with role="sweetener" that passes
 *  the nova / quality filters (excludes natural sugars at nova 1-2 with high quality).
 *  Add a line here to support a new "no X" category — no regex needed. */
export const INGREDIENT_ROLE_EXPANSION: Record<string, { role: string; minNova?: number; maxQuality?: number }> = {
  "artificial sweetener": { role: "sweetener", minNova: 3 },           // nova ≥3 → artificial/intense sweeteners + sugar alcohols
  "sweetener":            { role: "sweetener", minNova: 3 },
  "preservative":         { role: "preservative" },
  "artificial color":     { role: "color" },
  "colour":               { role: "color" },
  "emulsifier":           { role: "emulsifier" },
  "maida":                { role: "starch", maxQuality: 20 },
  "refined flour":        { role: "starch", maxQuality: 20 },
  // NOTE: "msg" and "monosodium glutamate" are handled by a dedicated regex
  // family in ingredientPresent() — NOT by role expansion (prevents false
  // matching on salt/rock salt which also have role:"flavor").
};

// Computed at module load — list of ingredient names (normalized + aliases)
// for each role above, used by ingredientPresent's data-driven matcher.
let _roleNames: Map<string, { names: Set<string>; minNova?: number; maxQuality?: number }> | null = null;

function loadRoleNames(): Map<string, { names: Set<string>; minNova?: number; maxQuality?: number }> {
  if (_roleNames) return _roleNames;
  _roleNames = new Map();

  for (const [avoidTerm, spec] of Object.entries(INGREDIENT_ROLE_EXPANSION)) {
    const names = new Set<string>();
    // Collect from known-ingredients dictionary
    for (const [normName, entry] of Object.entries(KNOWN_INGREDIENTS)) {
      if (entry.role !== spec.role) continue;
      if (spec.minNova != null && entry.nova_class < spec.minNova) continue;
      if (spec.maxQuality != null && entry.intrinsic_quality > spec.maxQuality) continue;
      names.add(normName);
      // include space-normalized variant for ingredients with spaces
      const compact = normName.replace(/\s+/g, "");
      if (compact !== normName) names.add(compact);
    }
    _roleNames.set(avoidTerm, { names, minNova: spec.minNova, maxQuality: spec.maxQuality });
  }
  return _roleNames;
}

/** Returns every known ingredient name (canonical + aliases) for a given
 *  avoid term category. For example, "artificial sweetener" returns
 *  [aspartame, sucralose, acesulfame potassium, saccharin, ...].
 *  Computed once at module load, zero per-query cost beyond the regex. */
export function getIngredientNamesForAvoid(avoidTerm: string): string[] | null {
  const roleMap = loadRoleNames();
  const entry = roleMap.get(avoidTerm.toLowerCase().trim());
  if (!entry) return null;
  return [...entry.names];
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-LLM validation rules (applied AFTER LLM rates, before DB store)
// ─────────────────────────────────────────────────────────────────────────────

import type { IngredientRole, ConcernTier } from "@/lib/scoring/ingredient-llm";

// Ingredients that are definitionally NOVA 1 — cannot be NOVA 2-4
const ALWAYS_NOVA1 = new Set([
  "water", "salt", "sea salt", "rock salt", "iodized salt", "milk", "eggs",
  "oats", "wheat", "rice", "honey", "ghee", "butter", "cocoa solids", "cocoa butter",
  "cocoa powder", "stevia", "inulin", "fructooligosaccharides", "fos",
  "chicory root fiber", "chicory inulin",
]);

// E-number ranges that imply specific roles
const INS_ROLE_MAP: Array<{ re: RegExp; role: IngredientRole; nova: number }> = [
  { re: /^(ins|e)\s*1[0-9]{2}[a-z]?$/i, role: "color", nova: 4 },
  { re: /^(ins|e)\s*2[0-9]{2}[a-z]?$/i, role: "preservative", nova: 4 },
  { re: /^(ins|e)\s*3[0-9]{2}[a-z]?$/i, role: "acid_regulator", nova: 4 },
  { re: /^(ins|e)\s*4[0-9]{2}[a-z]?$/i, role: "emulsifier", nova: 4 },
  { re: /^(ins|e)\s*5[0-9]{2}[a-z]?$/i, role: "acid_regulator", nova: 4 },
  { re: /^(ins|e)\s*9[0-9]{2}[a-z]?$/i, role: "sweetener", nova: 4 },
  { re: /^(ins|e)\s*1[0-9]{3}[a-z]?$/i, role: "starch", nova: 4 },
];

export type LmValidationResult = {
  nova_class: number;
  concern_tier: ConcernTier;
  role: IngredientRole;
  concern_reasons: string[];
  intrinsic_quality: number;
  corrected: boolean;
  correction_reason?: string;
};

/**
 * Validate and auto-correct an LLM rating before storing.
 * Returns the (possibly corrected) values + a flag indicating if correction happened.
 */
export function validateLmRating(
  name: string,
  lm: {
    nova_class: number;
    concern_tier: string;
    role: string;
    concern_reasons: string[];
    intrinsic_quality: number;
  },
): LmValidationResult {
  const n = name.toLowerCase().trim();

  // 1. Check known-ingredients override first (synonym-aware: "soya chunks" → soy)
  const known = resolveKnownCanonical(n);
  if (known) {
    return {
      nova_class: known.nova_class,
      concern_tier: known.concern_tier,
      role: known.role as IngredientRole,
      concern_reasons: known.concern_reasons,
      intrinsic_quality: known.intrinsic_quality,
      corrected: true,
      correction_reason: "known_ingredient_override",
    };
  }

  let nova = lm.nova_class;
  let tier = lm.concern_tier as ConcernTier;
  let role = lm.role as IngredientRole;
  let reasons = lm.concern_reasons;
  let quality = lm.intrinsic_quality;
  let corrected = false;
  let correction_reason: string | undefined;

  // 2. NOVA 1 enforcement for definitionally unprocessed ingredients
  if (ALWAYS_NOVA1.has(n) && nova !== 1) {
    nova = 1;
    corrected = true;
    correction_reason = "always_nova1";
  }

  // 3. INS/E-number role + NOVA inference
  for (const { re, role: inferredRole, nova: inferredNova } of INS_ROLE_MAP) {
    if (re.test(n)) {
      if (role !== inferredRole) { role = inferredRole; corrected = true; correction_reason = "ins_role_inference"; }
      if (nova < inferredNova) { nova = inferredNova; corrected = true; correction_reason = "ins_nova_inference"; }
      break;
    }
  }

  // 4. Can't be both innocuous AND NOVA 4 for non-emulsifiers
  // NOVA 4 additives are generally at least watchful
  if (nova === 4 && tier === "innocuous" && role !== "emulsifier" && role !== "base_food" && role !== "probiotic") {
    tier = "watchful";
    corrected = true;
    correction_reason = "nova4_should_be_watchful";
  }

  // 5. Probiotic/prebiotic role → always innocuous
  if (role === "probiotic" && tier !== "innocuous") {
    tier = "innocuous";
    corrected = true;
    correction_reason = "probiotic_is_innocuous";
  }

  // 6. quality sanity: NOVA 4 + watchful shouldn't be > 70
  if (nova === 4 && tier === "watchful" && quality > 70) {
    quality = Math.min(quality, 55);
    corrected = true;
    correction_reason = "quality_capped_nova4";
  }

  // 7. quality sanity: NOVA 1 innocuous shouldn't be < 50
  if (nova === 1 && tier === "innocuous" && quality < 50) {
    quality = Math.max(quality, 50);
    corrected = true;
    correction_reason = "quality_floor_nova1";
  }

  return { nova_class: nova, concern_tier: tier, role, concern_reasons: reasons, intrinsic_quality: quality, corrected, correction_reason };
}

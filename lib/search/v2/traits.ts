import { matchAdditives } from "@/lib/scoring/rules";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { TraitConfidenceMap, TraitId, TraitSourceMap, TraitVector } from "@/lib/search/v2/types";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Normalize macro to 0–1 using sensible per-100g caps. */
function densityScore(value: number | null, cap: number, invert = false): number | null {
  if (value == null) return null;
  const raw = clamp01(value / cap);
  return invert ? 1 - raw : raw;
}

const FLAVOUR_TOKENS = [
  "strawberry",
  "mango",
  "chocolate",
  "vanilla",
  "banana",
  "blueberry",
  "pista",
  "pistachio",
  "almond",
  "coconut",
  "lemon",
  "orange",
  "apple",
  "coffee",
  "masala",
  "spicy",
  "salted",
  "tomato",
  "cheese",
  "honey",
  "berry",
  "mixed fruit",
  "mixed berries",
];

export function extractFlavoursFromName(name: string): string[] {
  const lower = name.toLowerCase();
  const found: string[] = [];
  for (const f of FLAVOUR_TOKENS) {
    if (lower.includes(f)) found.push(f);
  }
  return [...new Set(found)];
}

const TYPE_PATTERNS: Array<{ type: string; re: RegExp; aliases?: string[] }> = [
  { type: "smoothie", re: /\bsmoothie\b/i, aliases: ["fruit smoothie"] },
  { type: "milk", re: /\bmilk\b/i, aliases: ["doodh"] },
  { type: "ghee", re: /\bghee\b/i },
  { type: "paneer", re: /\bpaneer\b/i },
  { type: "curd", re: /\b(curd|yogurt|dahi)\b/i },
  { type: "biscuit", re: /\b(biscuit|cookie|cookies)\b/i },
  { type: "snack", re: /\bsnacks?\b/i },
  { type: "namkeen", re: /\b(namkeen|bhujia|sev|chivda)\b/i },
  { type: "oats", re: /\boats?\b/i },
  { type: "juice", re: /\bjuice\b/i },
  { type: "peanut butter", re: /\bpeanut butter\b/i },
  { type: "protein bar", re: /\bprotein bars?\b/i },
  { type: "protein powder", re: /\b(protein powder|whey|isolate)\b/i },
  { type: "noodles", re: /\b(noodles?|instant noodles?)\b/i },
  { type: "chips", re: /\b(chips?|crisps?|wafers?)\b/i },
  { type: "chocolate", re: /\bchocolate\b/i },
  { type: "tea", re: /\btea\b/i },
  { type: "coffee", re: /\bcoffee\b/i },
  { type: "coconut water", re: /\bcoconut water\b/i },
  { type: "sports drink", re: /\b(energy drink|electrolyte|isotonic)\b/i },
  { type: "atta", re: /\b(atta|flour)\b/i },
  { type: "rice", re: /\brice\b/i },
  { type: "dal", re: /\b(dal|lentil|pulse)\b/i },
];

export function inferPrimaryType(opts: {
  name: string;
  subcategory?: string | null;
  category?: string | null;
  l3_category?: string | null;
}): { primary_type: string; type_aliases: string[] } {
  const hay = [opts.name, opts.subcategory, opts.category, opts.l3_category]
    .filter(Boolean)
    .join(" ");
  for (const { type, re, aliases } of TYPE_PATTERNS) {
    if (re.test(hay)) {
      return { primary_type: type, type_aliases: aliases ?? [] };
    }
  }
  const sub = opts.subcategory?.toLowerCase().trim();
  if (sub && sub.length >= 3) return { primary_type: sub, type_aliases: [] };
  const cat = opts.category?.toLowerCase().trim();
  if (cat && cat.length >= 3) return { primary_type: cat, type_aliases: [] };
  return { primary_type: "food", type_aliases: [] };
}

export function computeDerivedTraits(opts: {
  nutrition: ProductNutrition | null;
  ingredients_raw: string | null;
  scout_score: number | null;
  nova_group: number | null;
  name: string;
  category: string | null;
  subcategory: string | null;
  has_added_sugar: boolean | null;
  data_quality_score: number;
}): { traits: TraitVector; trait_source: TraitSourceMap; trait_confidence: TraitConfidenceMap } {
  const n = opts.nutrition;
  const traits: TraitVector = {};
  const trait_source: TraitSourceMap = {};
  const trait_confidence: TraitConfidenceMap = {};
  const dq = opts.data_quality_score;

  const setDerived = (id: TraitId, value: number | null) => {
    if (value == null) return;
    traits[id] = clamp01(value);
    trait_source[id] = "derived";
    trait_confidence[id] = dq;
  };

  const protein = num(n?.protein_g_100g);
  const fiber = num(n?.fiber_g_100g);
  const sugar = num(n?.sugar_g_100g ?? n?.added_sugar_g_100g);
  const fat = num(n?.fat_g_100g);
  const sodium = num(n?.sodium_mg_100g);
  const kcal = num(n?.energy_kcal_100g);

  setDerived("protein_density", densityScore(protein, 25));
  setDerived("fiber_density", densityScore(fiber, 15));
  setDerived("low_sugar", densityScore(sugar, 30, true));
  setDerived("low_sodium", densityScore(sodium, 800, true));
  setDerived("low_fat", densityScore(fat, 40, true));
  setDerived("low_calorie_density", densityScore(kcal, 500, true));
  setDerived("satiety", protein != null && fiber != null ? clamp01((protein * 0.6 + fiber * 0.4) / 20) : null);

  if (opts.nova_group != null) {
    setDerived("processing_level", clamp01((5 - opts.nova_group) / 4));
    setDerived("whole_food", opts.nova_group <= 2 ? 0.85 : opts.nova_group === 3 ? 0.45 : 0.15);
  }

  const additives = matchAdditives(opts.ingredients_raw);
  const additiveBurden = additives.length;
  setDerived("clean_label", clamp01(1 - additiveBurden * 0.12));

  if (opts.has_added_sugar === false) setDerived("no_added_sugar", 0.9);
  else if (opts.has_added_sugar === true) setDerived("no_added_sugar", 0.1);

  const hay = `${opts.name} ${opts.category ?? ""} ${opts.subcategory ?? ""}`.toLowerCase();
  if (/\b(coconut water|buttermilk|chaas|lassi|juice|drink|beverage|water)\b/.test(hay)) {
    setDerived("hydration", 0.75);
  }
  if (/\b(electrolyte|isotonic|sports|ors|coconut water)\b/.test(hay)) {
    setDerived("electrolytes", 0.7);
  }
  if (/\b(oats|millets?|brown rice|whole wheat|atta)\b/.test(hay)) {
    setDerived("slow_energy", 0.65);
  }
  if (/\b(energy bar|dates?|honey|glucose)\b/.test(hay)) {
    setDerived("quick_energy", 0.6);
  }
  if (protein != null && protein >= 15) {
    setDerived("gym_friendly", clamp01(protein / 25));
  }
  if (sugar != null && sugar <= 8 && fiber != null && fiber >= 3) {
    setDerived("diabetic_friendly", clamp01(0.5 + (10 - sugar) / 20));
  }

  return { traits, trait_source, trait_confidence };
}

export function effectiveTraitScore(
  trait: TraitId,
  value: number | null | undefined,
  row: { trait_source: TraitSourceMap; trait_confidence: TraitConfidenceMap; data_quality_score: number },
): number {
  if (value == null || !Number.isFinite(value)) return 0;
  const src = row.trait_source[trait] ?? "derived";
  const conf =
    src === "llm"
      ? Math.min(row.data_quality_score, row.trait_confidence[trait] ?? 0.5)
      : row.data_quality_score;
  return value * conf;
}

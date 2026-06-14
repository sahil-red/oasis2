import { effectiveTraitScore } from "@/lib/search/v2/traits";
import { calibrateTraitConfidence } from "@/lib/search/v2/trait-calibration";
import type {
  DietaryPrevalenceMap,
  ProductSearchIndexRow,
  TraitId,
} from "@/lib/search/v2/types";

const TRAIT_LABELS: Record<string, string> = {
  protein_density: "High Protein Density",
  fiber_density: "Good Fiber Content",
  low_sugar: "Low Sugar",
  low_sodium: "Low Sodium",
  low_fat: "Low Fat",
  low_saturated_fat: "Low Saturated Fat",
  healthy_fats: "Healthy Fats",
  low_calorie_density: "Low Calorie Density",
  low_carb: "Low Carb",
  whole_food: "Whole-Food Profile",
  hydration: "Hydration Support",
  electrolytes: "Natural Electrolytes",
  satiety: "Keeps You Full",
  gut_health: "Gut-Friendly",
  slow_energy: "Slow-Release Energy",
  quick_energy: "Quick Energy",
  antioxidant: "Antioxidant-Rich",
  vitamin_rich: "Vitamin-Rich",
  calcium_rich: "Calcium-Rich",
  iron_rich: "Iron-Rich",
  processing_level: "Minimally Processed",
  clean_label: "Clean Label",
  no_added_sugar: "No Added Sugar",
  low_gi: "Low Glycemic",
  kid_friendly: "Kid-Friendly",
  diabetic_friendly: "Diabetes-Friendly",
  gym_friendly: "Gym-Friendly Protein",
  elderly_friendly: "Gentle Nutrition",
  no_artificial_sweetener: "No Artificial Sweetener",
};

const DIETARY_BADGES: Array<{
  key: keyof Pick<ProductSearchIndexRow, "is_vegan" | "is_gluten_free" | "is_palm_oil_free" | "is_jain">;
  label: string;
}> = [
  { key: "is_vegan", label: "Vegan" },
  { key: "is_gluten_free", label: "Gluten Free" },
  { key: "is_palm_oil_free", label: "No Palm Oil" },
  { key: "is_jain", label: "Jain" },
];

/** Traits that are NEVER relevant on certain categories — absolute suppression. */
const TRAIT_IRRELEVANT: Record<string, string[]> = {
  // Low fat makes no sense on inherently fatty foods
  "low_fat": ["cheese", "ghee", "butter", "oil", "nuts", "seeds", "cream", "paneer", "chocolate bar", "dark chocolate", "milk chocolate", "peanut butter", "cashew", "almonds", "pista", "walnut", "mayonnaise"],
  // Low calorie is meaningless for high-energy-density foods
  "low_calorie_density": ["oil", "ghee", "butter", "nuts", "seeds", "chocolate", "jaggery", "honey", "sugar"],
  // High protein is irrelevant for drinks and flavoring items
  "protein_density": ["water", "soft drink", "tea", "coffee", "fruit juice", "soda", "energy drink", "sparkling water", "salt", "sugar", "jaggery", "honey", "oil", "ghee", "butter"],
  // No Artificial Sweetener is a false virtue signal on inherently sweetener-free categories
  "no_artificial_sweetener": ["biscuit", "chips", "crisps", "namkeen", "bread", "atta", "flour", "rice", "dal", "eggs", "milk", "curd", "paneer", "cheese", "ghee", "butter", "oil", "salt", "sugar", "jaggery", "honey", "spice", "nuts", "seeds", "oat", "muesli", "pasta", "noodle", "coffee", "tea", "chocolate bar", "dark chocolate", "milk chocolate"],
  // Vegan is not a choice on inherently plant-based categories
  "is_vegan": ["fruit juice", "water", "tea", "coffee", "rice", "dal", "spice", "salt", "sugar", "jaggery", "oil", "atta", "flour", "soda", "soft drink"],
  // Gluten Free is not a choice on naturally GF categories
  "is_gluten_free": ["rice", "dal", "milk", "eggs", "curd", "paneer", "fruit juice", "water", "sugar", "salt", "honey", "oil", "ghee", "spice", "tea", "coffee", "jaggery"],
  // Minimally Processed — suppress on obviously unprocessed categories
  "processing_level": ["salt", "sugar", "jaggery", "honey", "oil", "ghee", "water", "spice", "rice", "dal", "atta", "flour", "milk", "eggs", "nuts", "seeds", "tea", "coffee"],
  // Clean Label — suppress on single-ingredient whole foods  
  "clean_label": ["salt", "sugar", "oil", "ghee", "water", "honey", "milk", "eggs", "rice", "dal", "atta", "flour", "tea", "coffee"],
  // Whole Food — suppress on obviously processed categories
  "whole_food": ["soft drink", "soda", "energy drink", "chips", "crisps", "namkeen", "chocolate", "candy", "ice cream", "biscuit", "cookie", "cake", "pastry"],
};

/** Suppress dietary badges on inherently-compatible categories. */
const DIETARY_IRRELEVANT: Record<string, string[]> = {
  is_vegan: ["fruit juice", "water", "tea", "coffee", "rice", "dal", "spice", "salt", "sugar", "jaggery", "oil", "atta", "flour", "soda", "soft drink"],
  is_gluten_free: ["rice", "dal", "milk", "eggs", "curd", "paneer", "fruit juice", "water", "sugar", "salt", "honey", "oil", "ghee", "spice", "tea", "coffee"],
};

const SUPPRESSED_TRAITS: Partial<Record<string, TraitId[]>> = {
  water: ["hydration"],
  rice: ["whole_food"],
  salt: ["low_sodium"],
  honey: ["low_sugar", "whole_food"],
};

/** Check if a trait is irrelevant for this product category. */
function traitIrrelevant(traitId: TraitId | string, primaryType: string): boolean {
  const pt = (primaryType ?? "").toLowerCase();
  const blocked = TRAIT_IRRELEVANT[traitId];
  if (!blocked) return false;
  return blocked.some(b => pt === b || pt.includes(b) || b.includes(pt));
}

function dietaryIrrelevant(badgeKey: string, primaryType: string): boolean {
  const pt = (primaryType ?? "").toLowerCase();
  const blocked = DIETARY_IRRELEVANT[badgeKey];
  if (!blocked) return false;
  return blocked.some(b => pt === b || pt.includes(b) || b.includes(pt));
}

function isChippableClaim(claim: string, primaryType: string | null): boolean {
  const s = claim.trim();
  if (!s || s.length > 45) return false;
  const letters = s.replace(/[^A-Za-z]/g, "").length;
  if (letters > 0) {
    const upper = s.replace(/[^A-Z]/g, "").length;
    if (upper / letters > 0.6) return false;
  }
  if (/flavou?r|delicious|tast[ey]|premium|bursting|crunch|crispy|yummy|perfect/i.test(s)) return false;
  if (primaryType && s.toLowerCase() === primaryType) return false;
  return true;
}

const MAX_CHIPS = 4;
const PRODUCT_SLOTS = 3;

type ChipEntry = {
  label: string;
  priority: number;
  group: "product" | "ai";
};

export function getDisplayChips(
  row: Pick<
    ProductSearchIndexRow,
    | "traits"
    | "trait_source"
    | "trait_confidence"
    | "data_quality_score"
    | "claims"
    | "primary_type"
    | "is_vegan"
    | "is_gluten_free"
    | "is_palm_oil_free"
    | "is_jain"
  >,
  prevalence: DietaryPrevalenceMap | null,
  aiReasons?: string[],
): string[] {
  const type = row.primary_type ?? "unknown";
  const typePrev = prevalence?.[type] ?? { total: 0, is_vegan: 0, is_gluten_free: 0, is_palm_oil_free: 0, is_jain: 0 };
  const suppressed = SUPPRESSED_TRAITS[type] ?? [];
  const cohortTooSmall = typePrev.total < 5;

  const product: ChipEntry[] = [];
  const ai: ChipEntry[] = [];

  // 1. Differentiating traits (effective ≥ 0.6 + not irrelevant + not suppressed)
  for (const [traitId, rawValue] of Object.entries(row.traits)) {
    const tid = traitId as TraitId;
    if (suppressed.includes(tid)) continue;
    if (traitIrrelevant(traitId, type)) continue;
    const effective = effectiveTraitScore(tid, rawValue, row, calibrateTraitConfidence);
    if (effective < 0.6) continue;
    product.push({
      label: TRAIT_LABELS[traitId] ?? traitId,
      priority: Math.round(70 + effective * 30),
      group: "product",
    });
  }

  // 2. Verified claims (score 0.7 base) — filter out marketing fluff
  for (const claim of row.claims ?? []) {
    if (!isChippableClaim(claim, row.primary_type)) continue;
    // Format claims consistently with Title Case, same as trait labels
    const formatted = claim.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
    product.push({ label: formatted, priority: 70, group: "product" });
  }

  // 3. Dietary badges with prevalence + irrelevance suppression
  for (const badge of DIETARY_BADGES) {
    if (!row[badge.key]) continue;
    if (dietaryIrrelevant(badge.key, type)) continue;
    if (!cohortTooSmall) {
      const prevalencePct = typePrev[badge.key] ?? 0;
      if (prevalencePct >= 0.8) continue;
    }
    product.push({
      label: badge.label,
      priority: cohortTooSmall ? 60 : Math.round(50 + (1 - (typePrev[badge.key] ?? 0)) * 20),
      group: "product",
    });
  }

  // 4. AI match reasons
  for (const reason of aiReasons ?? []) {
    ai.push({ label: reason, priority: 60, group: "ai" });
  }

  // Sort each group by priority descending
  product.sort((a, b) => b.priority - a.priority);
  ai.sort((a, b) => b.priority - a.priority);

  // Deduplicate across groups (case-insensitive)
  const seen = new Set<string>();
  const add = (label: string) => {
    const key = label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const result: string[] = [];

  // Fill product slots first (up to PRODUCT_SLOTS)
  for (const chip of product) {
    if (result.length >= PRODUCT_SLOTS) break;
    if (add(chip.label)) result.push(chip.label);
  }

  // Fill remaining slots with AI reasons (up to MAX_CHIPS)
  for (const chip of ai) {
    if (result.length >= MAX_CHIPS) break;
    if (add(chip.label)) result.push(chip.label);
  }

  // If result has no AI reason but AI reasons exist at full capacity,
  // swap the lowest-priority product chip for the top AI reason
  if (product.length > 0 && ai.length > 0 && result.length === MAX_CHIPS) {
    const hasAnyAi = ai.some((a) => result.includes(a.label));
    if (!hasAnyAi) {
      const topAi = ai[0]!.label;
      if (add(topAi)) {
        result[result.length - 1] = topAi;
      }
    }
  }

  return result.slice(0, MAX_CHIPS);
}

import { effectiveTraitScore } from "@/lib/search/v2/traits";
import { calibrateTraitConfidence } from "@/lib/search/v2/trait-calibration";
import type {
  DietaryPrevalenceMap,
  ProductSearchIndexRow,
  TraitId,
} from "@/lib/search/v2/types";

const TRAIT_LABELS: Record<string, string> = {
  protein_density: "High protein density",
  fiber_density: "Good fiber content",
  low_sugar: "Low sugar",
  low_sodium: "Low sodium",
  low_fat: "Low fat",
  low_saturated_fat: "Low saturated fat",
  healthy_fats: "Healthy fats",
  low_calorie_density: "Low calorie density",
  low_carb: "Low carb",
  whole_food: "Whole-food profile",
  hydration: "Hydration support",
  electrolytes: "Natural electrolytes",
  satiety: "Keeps you full",
  gut_health: "Gut-friendly",
  slow_energy: "Slow-release energy",
  quick_energy: "Quick energy",
  antioxidant: "Antioxidant-rich",
  vitamin_rich: "Vitamin-rich",
  calcium_rich: "Calcium-rich",
  iron_rich: "Iron-rich",
  processing_level: "Minimally processed",
  clean_label: "Clean label",
  no_added_sugar: "No added sugar",
  low_gi: "Low glycemic",
  kid_friendly: "Kid-friendly",
  diabetic_friendly: "Diabetes-friendly",
  gym_friendly: "Gym-friendly protein",
  elderly_friendly: "Gentle nutrition",
};

const DIETARY_BADGES: Array<{
  key: keyof Pick<ProductSearchIndexRow, "is_vegan" | "is_gluten_free" | "is_palm_oil_free" | "is_jain">;
  label: string;
}> = [
  { key: "is_vegan", label: "Vegan" },
  { key: "is_gluten_free", label: "Gluten Free" },
  { key: "is_palm_oil_free", label: "No palm oil" },
  { key: "is_jain", label: "Jain" },
];

const SUPPRESSED_TRAITS: Partial<Record<string, TraitId[]>> = {
  water: ["hydration"],
  rice: ["whole_food"],
  salt: ["low_sodium"],
  honey: ["low_sugar", "whole_food"],
};

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

  // 1. Differentiating traits (score ≥ 0.6)
  for (const [traitId, rawValue] of Object.entries(row.traits)) {
    const tid = traitId as TraitId;
    if (suppressed.includes(tid)) continue;
    const effective = effectiveTraitScore(tid, rawValue, row, calibrateTraitConfidence);
    if (effective < 0.6) continue;
    product.push({
      label: TRAIT_LABELS[traitId] ?? traitId,
      priority: Math.round(70 + effective * 30),
      group: "product",
    });
  }

  // 2. Verified claims (score 0.7 base)
  for (const claim of row.claims ?? []) {
    product.push({ label: claim, priority: 70, group: "product" });
  }

  // 3. Dietary badges with prevalence suppression (skip if cohort < 5 — unreliable)
  for (const badge of DIETARY_BADGES) {
    if (!row[badge.key]) continue;
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

  // Deduplicate across groups
  const seen = new Set<string>();
  const add = (label: string) => {
    if (seen.has(label)) return false;
    seen.add(label);
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

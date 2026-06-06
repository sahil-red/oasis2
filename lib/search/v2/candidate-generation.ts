import { ingredientPresent } from "@/lib/search/ai-retrieval";
import { typeMatchTokens } from "@/lib/search/intent";
import { selectCategoriesForGoal } from "@/lib/search/v2/category-profiles";
import { resolveGoalWeights } from "@/lib/search/v2/goal-graph";
import type { CategoryTraitProfileRow, ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN } from "@/lib/search/v2/types";

/** §6 funnel: ~23k → ~500 candidates */
export const CANDIDATE_CAP = 500;

/** §6 membership: type ∈ {type,synonyms} using indexed primary_type + type_aliases */
function rowMatchesType(row: ProductSearchIndexRow, wanted: Set<string>): boolean {
  if (!wanted.size) return true;

  const rowPrimary = (row.primary_type ?? "").toLowerCase();
  if (rowPrimary && wanted.has(rowPrimary)) return true;

  for (const alias of row.type_aliases ?? []) {
    if (wanted.has(alias.toLowerCase())) return true;
  }

  // Un-enriched rows: word-boundary match on name only (not search_doc / ingredients)
  if (!rowPrimary) {
    const name = row.name.toLowerCase();
    for (const w of wanted) {
      if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(name)) {
        return true;
      }
    }
  }

  return false;
}

/** §6 flavours ⊇ required */
function rowMatchesFlavours(row: ProductSearchIndexRow, required: string[]): boolean {
  if (!required.length) return true;
  const flavours = row.flavours.map((f) => f.toLowerCase());
  const name = row.name.toLowerCase();
  return required.every((f) => flavours.includes(f.toLowerCase()) || name.includes(f.toLowerCase()));
}

function passesDietary(row: ProductSearchIndexRow, intent: SearchIntentV2): boolean {
  const c = intent.constraints;
  if (c.vegan && row.is_vegan === false) return false;
  if (c.vegetarian && row.is_veg === false) return false;
  if (c.gluten_free && row.is_gluten_free === false) return false;
  if (c.palm_oil_free && row.is_palm_oil_free === false) return false;
  return true;
}

function passesAllergens(row: ProductSearchIndexRow, excluded: string[]): boolean {
  if (!excluded.length) return true;
  const allergens = row.allergens.join(" ").toLowerCase();
  for (const a of excluded) {
    if (allergens.includes(a.toLowerCase())) return false;
  }
  return true;
}

function passesAvoidIngredients(row: ProductSearchIndexRow, avoid: string[]): boolean {
  if (!avoid.length) return true;
  const ingredients = row.search_doc ?? "";
  return !avoid.some((a) => ingredientPresent(ingredients, a));
}

function passesNutrition(row: ProductSearchIndexRow, intent: SearchIntentV2): boolean {
  const c = intent.constraints;
  if (c.max_price != null && row.price_inr != null && row.price_inr > c.max_price) return false;
  if (c.max_sugar_g != null && row.sugar_g != null && row.sugar_g > c.max_sugar_g) return false;
  if (c.max_fat_g != null && row.fat_g != null && row.fat_g > c.max_fat_g) return false;
  if (c.min_protein_g != null && row.protein_g != null && row.protein_g < c.min_protein_g) return false;

  // §14 relative nutrition tiers
  if (intent.modifiers.includes("high_protein_tier") && row.protein_tier === "low") return false;
  if (intent.modifiers.includes("low_sugar") && row.sugar_tier === "high") return false;
  if (intent.modifiers.includes("no_added_sugar") && row.has_added_sugar === true) return false;

  return true;
}

function passesDataQuality(row: ProductSearchIndexRow, minQuality: number): boolean {
  return row.data_quality_score >= minQuality;
}

/** §8 one representative per canonical_product_id (best data_quality) */
function dedupeCanonical(rows: ProductSearchIndexRow[]): ProductSearchIndexRow[] {
  const byCanon = new Map<string, ProductSearchIndexRow>();
  for (const row of rows) {
    const key = row.canonical_product_id ?? row.product_id;
    const existing = byCanon.get(key);
    if (!existing || row.data_quality_score > existing.data_quality_score) {
      byCanon.set(key, row);
    }
  }
  return [...byCanon.values()];
}

/**
 * §6 Candidate generation — membership filters only. Scores decide order later.
 * Goal route: §6a category_trait_profile overlap → hard filters → candidates.
 */
export function generateCandidates(
  index: ProductSearchIndexRow[],
  intent: SearchIntentV2,
  profiles: CategoryTraitProfileRow[],
  goalMap?: Map<string, import("@/lib/search/v2/types").GoalTraitMapRow>,
  minDataQuality = DATA_QUALITY_MIN,
): ProductSearchIndexRow[] {
  let pool = index.filter((row) => passesDataQuality(row, minDataQuality));

  // §6a goal candidate generation
  if (intent.kind === "goal" && intent.goal_id) {
    const weights = resolveGoalWeights(intent.goal_id, goalMap);
    if (weights) {
      const cats = selectCategoriesForGoal(profiles, weights);
      const keys = new Set(cats.map((c) => c.category_key));
      if (keys.size > 0) {
        pool = pool.filter((row) => {
          const cat = (row.category ?? "").trim().toLowerCase();
          const sub = (row.subcategory ?? "").trim().toLowerCase();
          const key = sub ? `${cat}::${sub}` : cat || "unknown";
          if (keys.has(key)) return true;
          return [...keys].some((k) => k === cat || k.startsWith(`${cat}::`));
        });
      }
    }
  }

  const typeTokens = typeMatchTokens(intent);
  const wantedTypes = new Set(typeTokens.map((t) => t.toLowerCase()));

  if (intent.kind === "brand") {
    const brandQ = intent.raw_query.toLowerCase();
    pool = pool.filter(
      (row) =>
        (row.brand ?? "").toLowerCase().includes(brandQ) ||
        (row.search_doc ?? "").includes(brandQ),
    );
  } else if (wantedTypes.size > 0) {
    pool = pool.filter((row) => rowMatchesType(row, wantedTypes));
  }

  pool = pool.filter(
    (row) =>
      rowMatchesFlavours(row, intent.required_flavours) &&
      passesDietary(row, intent) &&
      passesAllergens(row, intent.constraints.allergens_excluded) &&
      passesAvoidIngredients(row, intent.constraints.avoid_ingredients) &&
      passesNutrition(row, intent),
  );

  pool = dedupeCanonical(pool);
  return pool.slice(0, CANDIDATE_CAP);
}

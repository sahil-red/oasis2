import { ingredientPresent } from "@/lib/search/ai-retrieval";
import { cosineSimilarity, embedText, isEmbeddingConfigured } from "@/lib/search/v2/embeddings";
import { selectCategoriesForGoal } from "@/lib/search/v2/category-profiles";
import { lexicalTypeMatch } from "@/lib/search/v2/lexical-fallback";
import type { CategoryTraitProfileRow, ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN, TYPE_EMBEDDING_THRESHOLD } from "@/lib/search/v2/types";
import type { GoalTraitWeights } from "@/lib/search/v2/types";

export const CANDIDATE_CAP = 500;

async function rowMatchesType(
  row: ProductSearchIndexRow,
  intent: SearchIntentV2,
  queryTypeEmbed: number[] | null,
): Promise<boolean> {
  const wanted = intent.primary_type?.toLowerCase();
  if (!wanted) return true;

  if (row.primary_type?.toLowerCase() === wanted) return true;

  if (queryTypeEmbed?.length && row.type_embedding?.length) {
    const sim = cosineSimilarity(queryTypeEmbed, row.type_embedding);
    if (sim >= TYPE_EMBEDDING_THRESHOLD) return true;
  }

  // §9: vector down → lexical over enriched search_doc / catalog fields
  if (!isEmbeddingConfigured() || !row.type_embedding?.length) {
    return lexicalTypeMatch(row, wanted);
  }

  return false;
}

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
  return false;
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
  if (intent.modifiers.includes("high_protein_tier") && row.protein_tier === "low") return false;
  if (intent.modifiers.includes("low_sugar") && row.sugar_tier === "high") return false;
  if (intent.modifiers.includes("no_added_sugar") && row.has_added_sugar === true) return false;
  return true;
}

function passesDataQuality(row: ProductSearchIndexRow, minQuality: number): boolean {
  return row.data_quality_score >= minQuality;
}

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

function lexicalScore(row: ProductSearchIndexRow, query: string): number {
  const q = query.toLowerCase();
  const doc = row.search_doc ?? "";
  if (!doc) return 0;
  let score = 0;
  for (const token of q.split(/\s+/).filter((t) => t.length >= 3)) {
    if (doc.includes(token)) score += 1;
  }
  if (row.brand?.toLowerCase() && q.includes(row.brand.toLowerCase())) score += 3;
  return score;
}

/** §6 membership filters over LLM-enriched fields */
export async function generateCandidates(
  index: ProductSearchIndexRow[],
  intent: SearchIntentV2,
  profiles: CategoryTraitProfileRow[],
  goalWeights: GoalTraitWeights | null,
  minDataQuality = DATA_QUALITY_MIN,
): Promise<ProductSearchIndexRow[]> {
  let pool = index.filter((row) => passesDataQuality(row, minDataQuality));

  if (intent.kind === "goal" && goalWeights) {
    const cats = await selectCategoriesForGoal(profiles, goalWeights);
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

  const queryTypeEmbed = intent.primary_type ? await embedText(intent.primary_type) : null;

  if (intent.kind === "brand" && intent.brand) {
    const brandQ = intent.brand.toLowerCase();
    pool = pool.filter((row) => (row.brand ?? "").toLowerCase().includes(brandQ));
  } else if (intent.primary_type) {
    const matched: ProductSearchIndexRow[] = [];
    for (const row of pool) {
      if (await rowMatchesType(row, intent, queryTypeEmbed)) matched.push(row);
    }
    pool = matched;
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

  const scored = pool
    .map((row) => ({ row, lex: lexicalScore(row, intent.raw_query) }))
    .sort((a, b) => b.lex - a.lex)
    .slice(0, CANDIDATE_CAP)
    .map((x) => x.row);

  return scored;
}

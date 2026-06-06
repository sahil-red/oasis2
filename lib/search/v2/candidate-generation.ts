import { ingredientPresent } from "@/lib/search/ai-retrieval";
import { cosineSimilarity, embedText, isEmbeddingConfigured } from "@/lib/search/v2/embeddings";
import { selectCategoriesForGoal } from "@/lib/search/v2/category-profiles";
import { lexicalBlob, lexicalTypeMatch } from "@/lib/search/v2/lexical-fallback";
import type { CategoryTraitProfileRow, ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN, TYPE_EMBEDDING_THRESHOLD } from "@/lib/search/v2/types";
import type { GoalTraitWeights } from "@/lib/search/v2/types";

export const CANDIDATE_CAP = 500;

/** 0 = exact type, 1 = embedding, 2 = lexical fallback, 99 = no match */
function typeMatchTier(
  row: ProductSearchIndexRow,
  wanted: string,
  queryTypeEmbed: number[] | null,
): number {
  if (row.primary_type?.toLowerCase() === wanted) return 0;

  if (queryTypeEmbed?.length && row.type_embedding?.length) {
    const sim = cosineSimilarity(queryTypeEmbed, row.type_embedding);
    if (sim >= TYPE_EMBEDDING_THRESHOLD) return 1;
  }

  if (!isEmbeddingConfigured() || !row.type_embedding?.length) {
    return lexicalTypeMatch(row, wanted) ? 2 : 99;
  }

  return 99;
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

  if (intent.kind === "goal" && goalWeights && Object.keys(goalWeights).length > 0) {
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
    const wanted = intent.primary_type.toLowerCase();
    pool = pool.filter((row) => typeMatchTier(row, wanted, queryTypeEmbed) < 99);
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

  // Directed short lookups: lexical membership on search_doc (§9 degradation, not semantics)
  if (
    intent.kind === "directed" &&
    !intent.brand &&
    !intent.goal_phrase &&
    intent.required_flavours.length === 0
  ) {
    const STOP = new Set([
      "for",
      "with",
      "under",
      "over",
      "below",
      "above",
      "without",
      "the",
      "and",
      "healthy",
      "healthiest",
      "cheapest",
      "best",
      "free",
      "zero",
      "low",
      "high",
      "organic",
      "instant",
    ]);
    const tokens = intent.raw_query
      .toLowerCase()
      .replace(/₹\s*\d+/g, "")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d/.test(t));

    const typeBlob = intent.primary_type?.toLowerCase() ?? "";

    const DIETARY = new Set(["vegan", "vegetarian", "gluten", "jain", "nut", "sodium", "sugar", "protein", "fat"]);

    if (tokens.length === 1) {
      const t = tokens[0]!;
      pool = pool.filter((row) => {
        const blob = lexicalBlob(row);
        if ((typeBlob === "milk" || t === "doodh") && /\bbiscuit|cookie\b/.test(blob)) return false;
        return blob.includes(t) || (typeBlob && blob.includes(typeBlob));
      });
    } else if (tokens.length === 2 && !/\bfor\b/.test(intent.raw_query.toLowerCase())) {
      const hasDietary = tokens.some((t) => DIETARY.has(t));
      pool = pool.filter((row) => {
        const blob = lexicalBlob(row);
        if (hasDietary) {
          const productTokens = tokens.filter((t) => !DIETARY.has(t));
          return productTokens.length
            ? productTokens.some((t) => blob.includes(t))
            : tokens.some((t) => blob.includes(t));
        }
        const matched = tokens.filter((t) => blob.includes(t)).length;
        return matched >= 1;
      });
    }
  }

  const wanted = intent.primary_type?.toLowerCase() ?? null;
  const scored = pool
    .map((row) => ({
      row,
      lex: lexicalScore(row, intent.raw_query),
      tier: wanted ? typeMatchTier(row, wanted, queryTypeEmbed) : 0,
    }))
    .sort((a, b) => a.tier - b.tier || b.lex - a.lex)
    .slice(0, CANDIDATE_CAP)
    .map((x) => x.row);

  return scored;
}

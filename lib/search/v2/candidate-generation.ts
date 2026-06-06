import { ingredientPresent } from "@/lib/search/ai-retrieval";
import { cosineSimilarity, embedText, isEmbeddingConfigured } from "@/lib/search/v2/embeddings";
import { selectCategoriesForGoal } from "@/lib/search/v2/category-profiles";
import { lexicalTypeMatch } from "@/lib/search/v2/lexical-fallback";
import { reciprocalRankFusion } from "@/lib/search/v2/rrf";
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
  if (c.max_calories != null && row.energy_kcal != null && row.energy_kcal > c.max_calories) return false;
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

type ScoredCandidate = {
  row: ProductSearchIndexRow;
  lex: number;
  vec: number;
  tier: number;
};

/** Truncate to cap with tier-first ordering, RRF(lex-rank, vec-rank) within each tier. */
function truncateWithRrf(scored: ScoredCandidate[], cap: number): ProductSearchIndexRow[] {
  if (scored.length <= cap) return scored.map((s) => s.row);

  const tiers = [...new Set(scored.map((s) => s.tier))].sort((a, b) => a - b);
  const out: ProductSearchIndexRow[] = [];

  for (const tier of tiers) {
    if (out.length >= cap) break;
    const group = scored.filter((s) => s.tier === tier);
    const room = cap - out.length;

    if (group.length <= room) {
      out.push(...group.map((s) => s.row));
      continue;
    }

    const lexRanks = [...group]
      .sort((a, b) => b.lex - a.lex)
      .map((s, i) => ({ id: s.row.product_id, rank: i + 1 }));

    const lists = [lexRanks];
    if (group.some((s) => s.vec > 0)) {
      const vecRanks = [...group]
        .sort((a, b) => b.vec - a.vec)
        .map((s, i) => ({ id: s.row.product_id, rank: i + 1 }));
      lists.push(vecRanks);
    }

    const fused = reciprocalRankFusion(lists);
    const picked = [...group]
      .sort(
        (a, b) =>
          (fused.get(b.row.product_id) ?? 0) - (fused.get(a.row.product_id) ?? 0),
      )
      .slice(0, room)
      .map((s) => s.row);
    out.push(...picked);
  }

  return out;
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

  const queryTypeEmbed = intent.primary_type ? await embedText(intent.primary_type, "query") : null;

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

  if (pool.length <= CANDIDATE_CAP) return pool;

  const queryEmbed = isEmbeddingConfigured()
    ? await embedText(intent.raw_query, "query")
    : null;

  const wanted = intent.primary_type?.toLowerCase() ?? null;
  const scored: ScoredCandidate[] = pool.map((row) => ({
    row,
    lex: lexicalScore(row, intent.raw_query),
    vec:
      queryEmbed?.length && row.embedding?.length
        ? cosineSimilarity(queryEmbed, row.embedding)
        : 0,
    tier: wanted ? typeMatchTier(row, wanted, queryTypeEmbed) : 0,
  }));

  return truncateWithRrf(scored, CANDIDATE_CAP);
}

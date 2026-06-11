import { ingredientPresent } from "@/lib/search/ai-retrieval";
import { cosineSimilarity, embedText, isEmbeddingConfigured } from "@/lib/search/v2/embeddings";
import { selectCategoriesForGoal } from "@/lib/search/v2/category-profiles";
import { lexicalTypeMatch } from "@/lib/search/v2/lexical-fallback";
import { reciprocalRankFusion } from "@/lib/search/v2/rrf";
import { semanticTypeMatches } from "@/lib/search/v2/type-centroids";
import type { CategoryTraitProfileRow, ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";
import { DATA_QUALITY_MIN } from "@/lib/search/v2/types";
import type { GoalTraitWeights } from "@/lib/search/v2/types";

export const CANDIDATE_CAP = 500;

/** 0 = exact type, 1 = centroid-equivalent type, 2 = lexical fallback, 99 = no match.
 *  Equivalents come from type_centroids (data-driven: "biscuit" ≡ "biscuits" ≡
 *  "cookie") — the old per-row type_embedding tier was dead code once the index
 *  stopped shipping vectors. */
function typeMatchTier(
  row: ProductSearchIndexRow,
  wanted: string,
  equivalents: Set<string>,
): number {
  const rowType = row.primary_type?.toLowerCase();
  if (rowType === wanted) return 0;
  if (rowType && equivalents.has(rowType)) return 1;
  return lexicalTypeMatch(row, wanted) ? 2 : 99;
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
  // Labels under-report: a bag of roasted peanuts often has NO allergen
  // declaration. Screen the declared allergens AND the product's own name +
  // ingredient doc, so "peanut free" cannot serve literal peanuts.
  const allergens = row.allergens.join(" ").toLowerCase();
  const name = row.name.toLowerCase();
  const doc = row.search_doc ?? "";
  for (const a of excluded) {
    const needle = a.toLowerCase();
    if (allergens.includes(needle)) return false;
    if (name.includes(needle)) return false;
    if (ingredientPresent(doc, needle)) return false;
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
  // Relative asks ("high protein", "low sugar") are RANKING signals, never gates.
  // Tiers are within-cohort percentiles — "low" tier can be 24g protein (tofu in
  // a paneer cohort) and "low" sugar can be 22g (within chocolate). Hard-gating
  // on them mislabels by construction; ranking.ts boosts by absolute grams instead.
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
  limit?: number,
): Promise<ProductSearchIndexRow[]> {
  let pool = index.filter((row) => passesDataQuality(row, minDataQuality));

  if (intent.kind === "goal" && goalWeights && Object.keys(goalWeights).length > 0) {
    const cats = await selectCategoriesForGoal(profiles, goalWeights);
    const keys = new Set(cats.map((c) => c.category_key));
    if (keys.size > 0) {
      const catFiltered = pool.filter((row) => {
        const cat = (row.category ?? "").trim().toLowerCase();
        const sub = (row.subcategory ?? "").trim().toLowerCase();
        const key = sub ? `${cat}::${sub}` : cat || "unknown";
        if (keys.has(key)) return true;
        return [...keys].some((k) => k === cat || k.startsWith(`${cat}::`));
      });
      // Proportional threshold (was hardcoded 10 — the same cliff-edge pattern as the
      // old strict>=12 bug). Use limit if available, otherwise default to 10.
      if (catFiltered.length >= (limit != null ? Math.max(limit * 0.75, 3) : 10)) {
        pool = catFiltered;
      }
    }
  }

  // Data-driven type equivalents (cached centroid lookup) — replaces the dead
  // per-row type-embedding comparison and its wasted per-search Voyage call.
  const typeEquivalents = intent.primary_type
    ? await semanticTypeMatches(intent.primary_type)
    : new Set<string>();

  if (intent.kind === "brand" && intent.brand) {
    const brandQ = intent.brand.toLowerCase();
    pool = pool.filter((row) => (row.brand ?? "").toLowerCase().includes(brandQ));
  } else if (intent.primary_type) {
    const wanted = intent.primary_type.toLowerCase();
    const typeFiltered = pool.filter((row) => typeMatchTier(row, wanted, typeEquivalents) < 99);
    // User explicitly asked for this type — keep the filter whenever it matches
    // anything at all; the typed retrieval leg guarantees real coverage.
    if (typeFiltered.length > 0) {
      pool = typeFiltered;
    }
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

  // A fully-filtered-out pool must return EMPTY — never the raw ANN head, which
  // would silently bypass allergen/dietary/flavour filters and serve confident
  // garbage ("kiwi yogurt" → random yogurts). The relaxation ladder owns recovery
  // and tells the user what was loosened.
  if (pool.length === 0) return [];

  if (pool.length <= CANDIDATE_CAP) return pool;

  const queryEmbed = isEmbeddingConfigured()
    ? await embedText(intent.raw_query, "query")
    : null;

  const wanted = intent.primary_type?.toLowerCase() ?? null;
  const scored: ScoredCandidate[] = pool.map((row) => ({
    row,
    lex: lexicalScore(row, intent.raw_query),
    // Prefer the in-DB KNN distance (pgvector rows ship without raw vectors);
    // fall back to JS cosine only on the in-memory path.
    vec:
      row.knn_distance != null
        ? 1 - row.knn_distance
        : queryEmbed?.length && row.embedding?.length
          ? cosineSimilarity(queryEmbed, row.embedding)
          : 0,
    tier: wanted ? typeMatchTier(row, wanted, typeEquivalents) : 0,
  }));

  return truncateWithRrf(scored, CANDIDATE_CAP);
}

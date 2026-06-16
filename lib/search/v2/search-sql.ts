/**
 * SQL-based candidate retrieval — single PostgreSQL query replacing the
 * 3-leg (ANN + typed + brand) approach with inline filtering and ranking.
 */
import type { SearchIntentV2 } from "@/lib/search/v2/types";
import { getIngredientNamesForAvoid } from "@/lib/scoring/ingredient-known";

export function buildSearchSql(
  queryEmbedding: number[],
  intent: SearchIntentV2,
  typeEquivalents: string[] | null,
  limit = 200,
  minQuality = 0.5,
): { sql: string; params: unknown[] } {
  const c = intent.constraints;
  const vecStr = "[" + queryEmbedding.join(",") + "]";
  const noAddedSugar = intent.modifiers?.includes("no_added_sugar");
  const brandPatt = intent.brand
    ? "%" + intent.brand.toLowerCase().replace(/[^a-z0-9]+/g, "%") + "%"
    : null;
  const avoid = c.avoid_ingredients ?? [];
  // Expand umbrella terms to specific ingredient names.
  // "artificial sweetener" → [aspartame, sucralose, acesulfame potassium, ...]
  const expandedAvoid: string[] = [];
  for (const term of avoid) {
    const names = getIngredientNamesForAvoid(term);
    if (names?.length) {
      expandedAvoid.push(...names);
    } else {
      // Not a known umbrella term — pass through as-is (literal ingredient name)
      expandedAvoid.push(term);
    }
  }

  const params: unknown[] = [vecStr];
  const p = (v: unknown) => { params.push(v); return params.length; };

  const mIdx = p(minQuality);
  // Lexical leg: the raw query drives ts_rank_cd over search_tsv, fused into the
  // best_match blend below so keyword/brand tokens disambiguate vector neighbours
  // ("chocolate milk" → the drink, not chocolate bars). Only bind the param for
  // best_match — explicit sorts don't reference it, and an unreferenced param
  // trips Postgres' type inference (42P18).
  const isBestMatch = !intent.sort || intent.sort === "best_match";
  const qIdx = isBestMatch ? p(intent.raw_query ?? "") : 0;

  let extraConditions = "";
  const add = (sql: string, v: unknown) => {
    p(v);
    extraConditions += " " + sql.replace(/\?/, "$" + params.length);
  };

  if (brandPatt) add("AND psi.brand ILIKE ?", brandPatt);
  if (c.max_price != null) add("AND psi.price_inr <= ?", c.max_price);
  if (c.max_sugar_g != null) add("AND COALESCE(NULLIF(psi.total_sugar_g, 0), psi.sugar_g) <= ?", c.max_sugar_g);
  if (c.max_fat_g != null) add("AND COALESCE(NULLIF(psi.total_fat_g, 0), psi.fat_g) <= ?", c.max_fat_g);
  if (c.max_calories != null) add("AND COALESCE(NULLIF(psi.total_calories, 0), psi.energy_kcal) <= ?", c.max_calories);
  if (c.min_protein_g != null) add("AND COALESCE(NULLIF(psi.total_protein_g, 0), psi.protein_g) >= ?", c.min_protein_g);
  if (c.vegan) extraConditions += " AND psi.is_vegan = TRUE";
  if (c.vegetarian) extraConditions += " AND psi.is_veg = TRUE";
  if (c.gluten_free) extraConditions += " AND psi.is_gluten_free = TRUE";
  if (c.palm_oil_free) extraConditions += " AND psi.is_palm_oil_free = TRUE";
  // "No added sugar": exclude only products that CONFIDENTLY contain it — flagged
  // AND measuring real sugar. A 0g-sugar product can't have added sugar (so an
  // over-eager flag never excludes it), and an unknown flag (NULL) is included
  // rather than dropped. This is the fix for "X without added sugar" returning ~0.
  if (noAddedSugar)
    extraConditions +=
      " AND NOT (psi.has_added_sugar IS TRUE AND COALESCE(NULLIF(psi.total_sugar_g, 0), psi.sugar_g) > 0.5)";
  if (expandedAvoid.length > 0) add("AND NOT EXISTS (SELECT 1 FROM unnest(?::text[]) ing WHERE psi.search_doc ILIKE ('% ' || ing || ' %') OR psi.search_doc ILIKE (ing || ' %') OR psi.search_doc ILIKE ('% ' || ing) OR psi.search_doc = ing)", expandedAvoid);

  // Taxonomy grounding — constrain to the CLEAN Zepto facet the resolver chose:
  // subcategory when it was confident, widen to category when it wasn't, and fall
  // back to the (fragmented) primary_type filter only when no facet was resolved.
  // This is the precision lever — it cuts conflation leaks (chocolate milk → bars)
  // the 1,999-value primary_type filter can't.
  const facetSubs = intent.facet_subcategories ?? [];
  const facetCats = intent.facet_categories ?? [];
  let groundingClause: string;
  if (facetSubs.length) {
    groundingClause = `AND psi.subcategory = ANY($${p(facetSubs)}::text[])`;
  } else if (facetCats.length) {
    groundingClause = `AND psi.category = ANY($${p(facetCats)}::text[])`;
  } else {
    const ti = p(typeEquivalents);
    groundingClause = `AND ($${ti}::text[] IS NULL OR psi.primary_type = ANY($${ti}::text[]))`;
  }

  const sortClause = intent.sort === "cheapest"
    ? "COALESCE(-psi.price_inr, -1e9)"
    : intent.sort === "highest_protein"
    ? "COALESCE(NULLIF(psi.total_protein_g, 0), psi.protein_g, -1)"
    : intent.sort === "lowest_sugar"
    ? "-COALESCE(COALESCE(NULLIF(psi.total_sugar_g, 0), psi.sugar_g), 1e9)"
    : intent.sort === "healthiest"
    ? "COALESCE(psi.scout_score, 50)"
    // Health-first blend with Scout tier floor.
    // Healthy products surface first on generic queries ("chips").
    // Products below Scout 40 get a heavy penalty, below 65 get a light penalty.
    // Health-first + hybrid relevance (semantic vector + lexical FTS) + popularity,
    // with a Scout tier floor. FTS (ts_rank_cd, normalised 0–1) disambiguates vector
    // neighbours. Weights are a starting point — tune against `pnpm search:eval`.
    : `(0.40 * COALESCE(psi.scout_score / 100.0, 0.45) + 0.28 * (1.0 - COALESCE((psi.embedding <=> $1::vector(1024)), 1.0)) + 0.22 * COALESCE(ts_rank_cd(psi.search_tsv, phraseto_tsquery('simple'::regconfig, $${qIdx}::text), 32), 0) + 0.10 * (LN(2 + psi.click_count * 0.5 + psi.save_count * 0.8) / 5.0) - CASE WHEN psi.scout_score IS NOT NULL AND psi.scout_score < 40 THEN 0.30 WHEN psi.scout_score IS NOT NULL AND psi.scout_score < 65 THEN 0.10 ELSE 0.00 END)`;

  const sql = `SELECT psi.product_id, psi.name, psi.brand, psi.primary_type, psi.price_inr, psi.scout_score, psi.sugar_g, psi.protein_g, psi.fat_g, psi.fiber_g, psi.is_vegan, psi.is_gluten_free, psi.is_palm_oil_free, psi.has_added_sugar, psi.data_quality_score, 1.0 - COALESCE((psi.embedding <=> $1::vector(1024)), 1.0) AS relevance_score, COALESCE(psi.scout_score / 100.0, 0.45) AS health_score FROM product_search_index psi WHERE psi.embedding IS NOT NULL AND psi.data_quality_score >= $${mIdx} ${groundingClause}${extraConditions} ORDER BY ${sortClause} DESC LIMIT ${limit}`;

  return { sql, params };
}

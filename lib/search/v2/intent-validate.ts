/**
 * Intent validation — post-LLM scrub that normalizes every intent field
 * against catalog data. Catches the class of bugs where LLM output is
 * plausible but wrong (brand name not in catalog, type has a variant
 * spelling, avoid_ingredients includes marketing claims).
 */
import type { IndexCatalogMeta } from "@/lib/search/v2/index-meta";
import type { SearchIntentV2 } from "@/lib/search/v2/types";

const norm = (s: string) => s.toLowerCase().replace(/['']/g, "").trim();
const canon = (s: string) => s.replace(/[_\-\s]+/g, "");

/** Cross-check LLM intent against the catalog. Returns a corrected copy. */
export function validateIntent(
  intent: SearchIntentV2,
  meta: IndexCatalogMeta,
): SearchIntentV2 {
  let corrected = { ...intent };
  let brandChanged = false;
  let typeChanged = false;

  // ── Brand validation ──
  if (corrected.brand) {
    const b = norm(corrected.brand);
    // Exact match
    if (meta.brands.has(b)) {
      // brand is correct — keep as-is
    } else {
      // Fuzzy: check if any brand contains this query
      const matches = [...meta.brands].filter(mb => 
        norm(mb).includes(b) || b.includes(norm(mb))
      );
      if (matches.length === 1) {
        corrected = { ...corrected, brand: matches[0]! };
        brandChanged = true;
      } else if (matches.length > 1) {
        // Pick the shortest match (most likely canonical)
        const best = matches.reduce((a, b) => a.length <= b.length ? a : b);
        corrected = { ...corrected, brand: best };
        brandChanged = true;
      }
    }
  }

  // ── Type validation ──
  if (corrected.primary_type) {
    const t = corrected.primary_type.toLowerCase().trim();
    const canonical = canon(t);
    
    // Check if the canonical form matches a known type
    if (meta.primaryTypes.has(t)) {
      // Exact match — keep
    } else {
      const matches = [...meta.primaryTypes].filter(mt => canon(mt) === canonical);
      if (matches.length === 1) {
        corrected = { ...corrected, primary_type: matches[0]! };
        typeChanged = true;
      } else if (matches.length > 1) {
        // Prefer the one without underscores
        const best = matches.find(m => !m.includes("_")) ?? matches[0]!;
        corrected = { ...corrected, primary_type: best };
        typeChanged = true;
      }
    }
  }

  // ── Avoid ingredients: strip marketing claims ──
  // "no added sugar" / "without preservatives" should not become avoid_ingredients
  // because products ADVERTISE these claims and the literal text match would
  // exclude the products the user actually wants.
  const CLAIM_PATTERNS = /\b(no added sugar|no sugar|without sugar|added sugar|without preservative|no preservative|no maida|no artificial|sugar free|fat free|palm oil free|gluten free|lactose free|preservative free)\b/i;
  if (corrected.constraints.avoid_ingredients.length > 0) {
    const filtered = corrected.constraints.avoid_ingredients.filter(
      ing => !CLAIM_PATTERNS.test(ing)
    );
    if (filtered.length !== corrected.constraints.avoid_ingredients.length) {
      corrected = {
        ...corrected,
        constraints: { ...corrected.constraints, avoid_ingredients: filtered },
      };
    }
  }

  // ── No-added-sugar: boost ranking, don't hard-filter ──
  // If the LLM set max_sugar_g=0 for "no added sugar", remove the hard filter.
  // Natural sugar from fruit, milk, etc. is still acceptable.
  if (corrected.constraints.max_sugar_g === 0 && 
      corrected.modifiers?.includes("no_added_sugar")) {
    corrected = {
      ...corrected,
      constraints: { ...corrected.constraints, max_sugar_g: undefined },
    };
  }

  // ── Log corrections ──
  if (brandChanged || typeChanged) {
    if (process.env.SEARCH_TELEMETRY) {
      console.log(JSON.stringify({
        type: "intent_validation",
        query: intent.raw_query,
        ...(brandChanged ? { brand_before: intent.brand, brand_after: corrected.brand } : {}),
        ...(typeChanged ? { type_before: intent.primary_type, type_after: corrected.primary_type } : {}),
      }));
    }
  }

  return corrected;
}

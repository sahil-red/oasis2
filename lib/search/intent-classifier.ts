/**
 * Local intent classifier — rule-based, 0-1ms, no external service.
 *
 * Replaces the LLM intent resolution for ~87% of common queries.
 * Non-matching queries return null → LLM fallback runs unchanged.
 *
 * Same logic as python-intent/main.py (stateless v2), ported to TypeScript.
 */

import type { IndexCatalogMeta } from "@/lib/search/v2/index-meta";
import type { ConstraintPriority, SearchIntentV2 } from "@/lib/search/v2/types";

// ── Normalization ──

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w]/g, "");
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^\w]+/).filter((t) => t.length >= 2);
}

function editDistance(a: string, b: string): number {
  if (a.length < b.length) [a, b] = [b, a];
  if (!b) return a.length;
  let prev = [...Array(b.length + 1).keys()];
  for (const ca of a) {
    const curr = [prev[0]! + 1];
    for (let j = 0; j < b.length; j++) {
      curr.push(Math.min(
        prev[j + 1]! + 1,
        curr[j]! + 1,
        prev[j]! + (ca !== b[j] ? 1 : 0),
      ));
    }
    prev = curr;
  }
  return prev[b.length]!;
}

// ── Lookup index ──

class LookupIndex {
  brandsSet: Set<string>;
  typesSet: Set<string>;
  typeOriginals: Map<string, string>;
  multiwordTypes: Map<string, string>;
  multiwordBrands: Map<string, string>;

  constructor(brands: string[], primaryTypes: string[]) {
    this.brandsSet = new Set();
    this.typesSet = new Set();
    this.typeOriginals = new Map();
    this.multiwordTypes = new Map();
    this.multiwordBrands = new Map();

    for (const b of brands) {
      if (b) this.brandsSet.add(normalize(b));
    }
    for (const b of brands) {
      if (b && b.includes(" ")) {
        this.multiwordBrands.set(normalize(b), b);
      }
    }
    for (const t of primaryTypes) {
      if (!t) continue;
      const n = normalize(t);
      this.typesSet.add(n);
      this.typeOriginals.set(n, t);
      if (t.includes(" ")) {
        this.multiwordTypes.set(n, t);
      }
    }
  }

  findBrand(tokens: string[], query: string): string | null {
    const q = normalize(query);
    if (this.multiwordBrands.has(q)) return this.multiwordBrands.get(q)!;
    if (this.brandsSet.has(q)) return query.trim();

    // Check consecutive token pairs for multi-word brands
    for (let i = 0; i < tokens.length - 1; i++) {
      const pair = tokens[i]! + tokens[i + 1]!;
      if (this.multiwordBrands.has(pair)) return this.multiwordBrands.get(pair)!;
    }

    for (const t of tokens) {
      if (this.brandsSet.has(t)) {
        return t.charAt(0).toUpperCase() + t.slice(1);
      }
    }
    return null;
  }

  findPrimaryType(tokens: string[], query: string): string | null {
    const q = normalize(query);

    // 1. Exact multi-word match
    if (this.multiwordTypes.has(q)) return this.multiwordTypes.get(q)!;
    if (this.typesSet.has(q)) return this.typeOriginals.get(q)!;

    // 2. Multi-word substring: "vanilla ice cream" contains "ice cream"
    for (const [mwNorm, mwOrig] of this.multiwordTypes) {
      if (q.includes(mwNorm)) return mwOrig;
    }

    // 3. Individual token matching (exact first, then fuzzy)
    for (const t of tokens) {
      if (this.typesSet.has(t)) return this.typeOriginals.get(t)!;
      for (const [tpNorm, tpOrig] of this.typeOriginals) {
        if (t.length >= 3 && (tpNorm.includes(t) || (t.length >= 4 && editDistance(t, tpNorm) <= 1))) {
          return tpOrig;
        }
      }
    }

    // 4. Fuzzy on individual words of multi-word types
    for (const [tNorm, tOrig] of this.typeOriginals) {
      if (q.length < 3) continue;
      for (const word of tOrig.toLowerCase().split(/\s+/)) {
        const w = normalize(word);
        if (w.length < 3) continue;
        if (q.includes(w) || w.includes(q)) return tOrig;
        if (q.length >= 4 && w.length >= 4 && editDistance(q, w) <= 1) return tOrig;
      }
    }

    return null;
  }
}

// ── Goal phrases ──

const GOAL_PHRASES: [string, string][] = [
  ["diabetic friendly", "diabetic friendly"],
  ["diabetes friendly", "diabetes friendly"],
  ["pcos friendly", "pcos friendly"],
  ["pcos", "pcos friendly"],
  ["heart healthy", "heart healthy"],
  ["heart health", "heart health"],
  ["low cholesterol", "low cholesterol"],
  ["keto", "keto"],
  ["low carb", "low carb"],
  ["low carbohydrate", "low carb"],
  ["high protein", "high protein"],
  ["protein rich", "high protein"],
  ["highest protein", "high protein"],
  ["low sugar", "low sugar"],
  ["sugar free", "sugar free"],
  ["zero sugar", "sugar free"],
  ["no added sugar", "no added sugar"],
  ["low calorie", "low calorie"],
  ["low fat", "low fat"],
  ["weight loss", "weight loss"],
  ["fat loss", "weight loss"],
  ["muscle gain", "muscle gain"],
  ["bulking", "muscle gain"],
  ["bulk", "muscle gain"],
  ["gym", "gym"],
  ["fitness", "gym"],
  ["workout", "gym"],
  ["kids", "kids"],
  ["tiffin", "kids"],
  ["school lunch", "kids"],
  ["kids friendly", "kids"],
  ["pregnancy", "pregnancy"],
  ["prenatal", "pregnancy"],
  ["expecting", "pregnancy"],
  ["immunity", "immunity"],
  ["immunity boosting", "immunity"],
  ["antioxidant", "immunity"],
  ["bone health", "bone health"],
  ["calcium rich", "bone health"],
  ["anemia", "anemia"],
  ["iron deficiency", "anemia"],
  ["iron rich", "anemia"],
  ["blood pressure", "blood pressure"],
  ["hypertension", "blood pressure"],
  ["low sodium", "blood pressure"],
  ["vegan", "vegan"],
  ["plant based", "vegan"],
  ["dairy free", "vegan"],
  ["gluten free", "gluten free"],
  ["celiac", "gluten free"],
  ["gut health", "gut health"],
  ["digestion", "gut health"],
  ["probiotic", "gut health"],
  ["energy", "energy"],
  ["energy boost", "energy"],
  ["pre workout", "energy"],
  ["skin", "skin & hair"],
  ["hair", "skin & hair"],
  ["beauty", "skin & hair"],
  ["hydration", "hydration"],
  ["electrolytes", "hydration"],
  ["running", "running"],
  ["endurance", "running"],
  ["athlete", "running"],
  ["parents", "parents"],
  ["elderly", "parents"],
  ["senior", "parents"],
  ["clean eating", "clean eating"],
  ["whole food", "clean eating"],
  ["no additives", "clean eating"],
  ["healthy", "healthy"],
  ["healthiest", "healthy"],
  ["healthier", "healthy"],
  ["satiety", "satiety"],
  ["filling", "satiety"],
  ["protein budget", "protein budget"],
  // Hinglish
  ["kam fat", "low fat"],
  ["kam calorie", "low calorie"],
  ["kam cheeni", "low sugar"],
  ["bina cheeni", "sugar free"],
  ["bina tel", "low fat"],
  ["jyada protein", "high protein"],
  ["healthy khana", "healthy"],
];

function detectGoal(query: string): string | null {
  const q = query.toLowerCase().trim();
  for (const [phrase, mapped] of GOAL_PHRASES) {
    if (q.includes(phrase)) return mapped;
  }
  return null;
}

function detectModifiers(query: string): string[] {
  const mods: string[] = [];
  const q = query.toLowerCase();
  if (/\b(high|more|highest|most|jyada)\s+protein\b/.test(q)) mods.push("high_protein_tier");
  if (/\b(low|less|lowest|kam)\s+sugar\b/.test(q)) mods.push("low_sugar");
  if (/\bno\s+added\s+sugar\b/.test(q)) mods.push("no_added_sugar");
  if (/\b(zero|no|bina)\s+sugar\b/.test(q)) mods.push("no_added_sugar");
  return mods;
}

function detectSort(query: string): SearchIntentV2["sort"] {
  const q = query.toLowerCase();
  if (["cheapest", "budget", "affordable", "under 50", "under 100"].some((p) => q.includes(p))) return "cheapest";
  if (["highest protein", "more protein", "most protein", "high protein"].some((p) => q.includes(p))) return "highest_protein";
  if (["healthiest", "best rated", "top rated"].some((p) => q.includes(p))) return "healthiest";
  if (["lowest sugar", "less sugar", "sugar free", "zero sugar"].some((p) => q.includes(p))) return "lowest_sugar";
  return "best_match";
}

const VAGUE_PREFIXES = new Set(["something", "anything", "good", "best", "nice", "tasty", "cheap", "quick"]);

// ── Classification ──

export function classifyIntent(
  query: string,
  meta: IndexCatalogMeta,
): SearchIntentV2 | null {
  const brands = [...meta.brands];
  const primaryTypes = [...meta.primaryTypes];

  const idx = new LookupIndex(brands, primaryTypes);
  const tokens = tokenize(query);
  const queryLower = query.toLowerCase().trim();

  // Comparison queries → low confidence (LLM territory)
  if (/\b(healthier|cheaper)\s+than\b/.test(queryLower)) {
    const isHealthier = queryLower.includes("healthier");
    return buildIntent({
      kind: "directed",
      sort: isHealthier ? "healthiest" : "cheapest",
      confidence: 0.55,  // degrade to LLM
    });
  }

  const brand = idx.findBrand(tokens, queryLower);
  const ptype = idx.findPrimaryType(tokens, queryLower);
  const goalPhrase = detectGoal(queryLower);
  const modifiers = detectModifiers(queryLower);
  const sort = detectSort(queryLower);

  const first = tokens[0] ?? "";
  const isVague = VAGUE_PREFIXES.has(first) && !ptype && !brand;
  const isNaturalLang = tokens.length > 5 || (tokens.length > 4 && !brand);

  // Pure brand (full query matches brand)
  if (brand && idx.brandsSet.has(normalize(queryLower))) {
    return buildIntent({ kind: "brand", brand, confidence: 0.95 });
  }

  // Pure brand (multi-word matched, single token)
  if (brand && tokens.length === 1) {
    return buildIntent({ kind: "brand", brand, confidence: 0.95 });
  }

  // Brand + Type (skip for natural language)
  if (brand && ptype && !isNaturalLang) {
    return buildIntent({ kind: "directed", brand, primary_type: ptype, goal_phrase: goalPhrase, modifiers, sort, confidence: 0.92 });
  }

  // Pure type
  if (ptype && tokens.length === 1 && !brand) {
    return buildIntent({ kind: "directed", primary_type: ptype, confidence: 0.95 });
  }

  // Vague or natural language → degrade to LLM
  if (isVague || isNaturalLang) {
    return buildIntent({ kind: "ambiguous", confidence: 0.30 });
  }

  // Goal + Type
  if (goalPhrase && ptype) {
    return buildIntent({ kind: "directed", primary_type: ptype, goal_phrase: goalPhrase, modifiers, sort, confidence: 0.82 });
  }

  // Pure goal
  if (goalPhrase && !isVague) {
    return buildIntent({ kind: "goal", goal_phrase: goalPhrase, primary_type: ptype, modifiers, sort, confidence: 0.80 });
  }

  // Modifiers + type
  if (ptype) {
    return buildIntent({ kind: "directed", primary_type: ptype, modifiers, sort, confidence: 0.72 });
  }

  // Modifiers only → low confidence
  if (modifiers.length) {
    return buildIntent({ kind: "directed", modifiers, sort, confidence: 0.55 });
  }

  // Brand only (fuzzy)
  if (brand) {
    return buildIntent({ kind: "brand", brand, confidence: 0.65 });
  }

  // Ambiguous → degrade
  return buildIntent({ kind: "ambiguous", confidence: 0.30 });
}

// ── Intent builder ──

type PartialIntent = {
  kind: SearchIntentV2["kind"];
  brand?: string | null;
  primary_type?: string | null;
  goal_phrase?: string | null;
  modifiers?: string[];
  sort?: SearchIntentV2["sort"];
  confidence: number;
};

function buildIntent(p: PartialIntent): SearchIntentV2 {
  return {
    kind: p.kind,
    goal_phrase: p.goal_phrase?.trim() || null,
    goal_id: null,
    brand: p.brand?.trim() || null,
    primary_type: p.primary_type?.trim().toLowerCase() || null,
    use_case: null,
    required_flavours: [],
    modifiers: p.modifiers ?? [],
    constraints: {
      avoid_ingredients: [],
      allergens_excluded: [],
    },
    constraint_priorities: [] as ConstraintPriority[],
    sort: p.sort ?? "best_match",
    comparison_ref: null,
    comparison_mode: null,
    confidence: Math.max(0, Math.min(1, p.confidence)),
    intent_source: "python-classifier",
    raw_query: "",
    trait_weights: {},
  };
}

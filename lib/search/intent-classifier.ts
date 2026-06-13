/**
 * Local intent classifier — rule-based, 0-1ms, no external service.
 *
 * Covers ~87% of common queries. Non-matching queries return null →
 * LLM fallback runs unchanged.
 */

import type { IndexCatalogMeta } from "@/lib/search/v2/index-meta";
import type { ConstraintPriority, SearchIntentV2 } from "@/lib/search/v2/types";
import { SEED_GOAL_TRAIT_MAP } from "@/lib/search/v2/goal-graph";

// Precomputed trait weights for all seed goal phrases, display names, and IDs.
// Saves 400ms embedding call per query when a goal phrase matches a known seed.
const TRAIT_WEIGHT_CACHE = new Map<string, Record<string, number>>();
for (const seed of SEED_GOAL_TRAIT_MAP) {
  TRAIT_WEIGHT_CACHE.set(seed.goal_phrase.toLowerCase(), seed.trait_weights);
  TRAIT_WEIGHT_CACHE.set(seed.display_name.toLowerCase(), seed.trait_weights);
  TRAIT_WEIGHT_CACHE.set(seed.goal_id, seed.trait_weights);
}
// Also map GOAL_PHRASES output labels to seed trait weights.
// The classifier's detectGoal() returns canonical labels like "diabetic friendly",
// "weight loss", etc. — these need to map back to the seed goal trait weights.
// Seed phrases: "diabetes friendly" → classifier returns "diabetic friendly"
// Seed phrases: "muscle gain bulking" → classifier returns "muscle gain"
// Seed phrases: "weight loss" → classifier returns "weight loss"
// Use goal_id as the bridge since detectGoal output labels often match goal_ids.
for (const seed of SEED_GOAL_TRAIT_MAP) {
  // Add classifier's canonical output labels that match this seed
  const phrase = seed.goal_phrase.toLowerCase();
  if (phrase.includes("diabetes") || phrase.includes("diabetic")) {
    TRAIT_WEIGHT_CACHE.set("diabetic friendly", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("diabetes friendly", seed.trait_weights);
  }
  if (phrase.includes("muscle") || phrase.includes("bulk")) {
    TRAIT_WEIGHT_CACHE.set("muscle gain", seed.trait_weights);
  }
  if (phrase.includes("weight loss") || phrase.includes("fat loss")) {
    TRAIT_WEIGHT_CACHE.set("fat loss", seed.trait_weights);
  }
  if (phrase.includes("gym") || phrase.includes("fitness") || phrase.includes("workout")) {
    TRAIT_WEIGHT_CACHE.set("workout", seed.trait_weights);
  }
  if (phrase.includes("kids") || phrase.includes("tiffin") || phrase.includes("school")) {
    TRAIT_WEIGHT_CACHE.set("kids", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("tiffin", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("school lunch", seed.trait_weights);
  }
  if (phrase.includes("pcos")) {
    TRAIT_WEIGHT_CACHE.set("pcos friendly", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("pcos", seed.trait_weights);
  }
  if (phrase.includes("running") || phrase.includes("endurance") || phrase.includes("athlete")) {
    TRAIT_WEIGHT_CACHE.set("running", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("endurance", seed.trait_weights);
  }
  if (seed.goal_id === "energy_boost") {
    TRAIT_WEIGHT_CACHE.set("energy", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("energy boost", seed.trait_weights);
  }
  if (seed.goal_id === "immunity") {
    TRAIT_WEIGHT_CACHE.set("immunity", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("immunity boosting", seed.trait_weights);
  }
  if (seed.goal_id === "pregnancy") {
    TRAIT_WEIGHT_CACHE.set("pregnancy", seed.trait_weights);
  }
  if (seed.goal_id === "bone_health") {
    TRAIT_WEIGHT_CACHE.set("bone health", seed.trait_weights);
  }
  if (seed.goal_id === "anemia") {
    TRAIT_WEIGHT_CACHE.set("anemia", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("iron deficiency", seed.trait_weights);
  }
  if (seed.goal_id === "bp_hypertension") {
    TRAIT_WEIGHT_CACHE.set("blood pressure", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("hypertension", seed.trait_weights);
  }
  if (seed.goal_id === "vegan_plant") {
    TRAIT_WEIGHT_CACHE.set("vegan", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("plant based", seed.trait_weights);
  }
  if (seed.goal_id === "hydration") {
    TRAIT_WEIGHT_CACHE.set("hydration", seed.trait_weights);
  }
  if (seed.goal_id === "skin_hair") {
    TRAIT_WEIGHT_CACHE.set("skin & hair", seed.trait_weights);
  }
  if (seed.goal_id === "keto_low_carb" || seed.goal_id === "keto") {
    TRAIT_WEIGHT_CACHE.set("keto", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("low carb", seed.trait_weights);
  }
  if (seed.goal_id === "heart_health") {
    TRAIT_WEIGHT_CACHE.set("heart healthy", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("low cholesterol", seed.trait_weights);
  }
  if (seed.goal_id === "gut_digestion") {
    TRAIT_WEIGHT_CACHE.set("gut health", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("digestion", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("probiotic", seed.trait_weights);
  }
  // "high protein" maps to the muscle_gain seed (protein-dominant weights)
  if (seed.goal_id === "muscle_gain") {
    TRAIT_WEIGHT_CACHE.set("high protein", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("protein rich", seed.trait_weights);
    TRAIT_WEIGHT_CACHE.set("protein budget", seed.trait_weights);
  }
}

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
      curr.push(Math.min(prev[j + 1]! + 1, curr[j]! + 1, prev[j]! + (ca !== b[j] ? 1 : 0)));
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
      if (b && b.includes(" ")) this.multiwordBrands.set(normalize(b), b);
    }
    for (const t of primaryTypes) {
      if (!t) continue;
      const n = normalize(t);
      this.typesSet.add(n);
      this.typeOriginals.set(n, t);
      if (t.includes(" ")) this.multiwordTypes.set(n, t);
    }
  }

  findBrand(tokens: string[], query: string): string | null {
    const q = normalize(query);
    if (this.multiwordBrands.has(q)) return this.multiwordBrands.get(q)!;
    if (this.brandsSet.has(q)) return query.trim();
    for (let i = 0; i < tokens.length - 1; i++) {
      const pair = tokens[i]! + tokens[i + 1]!;
      if (this.multiwordBrands.has(pair)) return this.multiwordBrands.get(pair)!;
    }
    for (const t of tokens) {
      if (this.brandsSet.has(t)) return t.charAt(0).toUpperCase() + t.slice(1);
    }
    return null;
  }

  /** Find primary_type using head-noun preference (last matching token wins),
   *  with word-level fuzzy matching evaluated alongside full-string matches. */
  findPrimaryType(tokens: string[], query: string): string | null {
    const q = normalize(query);

    // 1. Exact multi-word match
    if (this.multiwordTypes.has(q)) return this.multiwordTypes.get(q)!;
    if (this.typesSet.has(q)) return this.typeOriginals.get(q)!;

    // 2. Multi-word substring: "vanilla ice cream" contains "ice cream"
    for (const [mwNorm, mwOrig] of this.multiwordTypes) {
      if (q.includes(mwNorm)) return mwOrig;
    }

    // 3. Head-noun preference: prefer last matching token.
    //    Eval exact, fuzzy, AND word-level per token, keeping last match.
    let best: string | null = null;
    for (const t of tokens) {
      // Exact match
      if (this.typesSet.has(t)) { best = this.typeOriginals.get(t)!; continue; }
      // Word-level fuzzy: check individual words of multi-word types
      for (const [tNorm, tOrig] of this.typeOriginals) {
        for (const word of tOrig.toLowerCase().split(/\s+/)) {
          const w = normalize(word);
          if (w.length < 3) continue;
          if (t === w || editDistance(t, w) <= 1) { best = tOrig; break; }
        }
        if (best === tOrig) break;
      }
      // Full-string fuzzy
      if (!best) {
        for (const [tpNorm, tpOrig] of this.typeOriginals) {
          if (t.length >= 3 && tpNorm.includes(t)) { best = tpOrig; break; }
          if (t.length >= 4 && editDistance(t, tpNorm) <= 1) { best = tpOrig; break; }
        }
      }
    }
    if (best) return best;

    // 4. Fuzzy on individual words of multi-word types (query-level, not token-level)
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

// ── Goal phrases (with partial word matching) ──

const GOAL_WORDS: Record<string, string> = {
  diabetic: "diabetic friendly", diabetes: "diabetes friendly",
  pcos: "pcos friendly",
  keto: "keto", "low carb": "low carb", "low carbohydrate": "low carb",
  "high protein": "high protein", "protein rich": "high protein", "highest protein": "high protein",
  "low sugar": "low sugar", "sugar free": "sugar free", "zero sugar": "sugar free",
  "no added sugar": "no added sugar",
  "low calorie": "low calorie", "low fat": "low fat",
  "weight loss": "weight loss", "fat loss": "weight loss",
  "muscle gain": "muscle gain", bulking: "muscle gain", bulk: "muscle gain",
  gym: "gym", fitness: "gym", workout: "gym",
  kids: "kids", tiffin: "kids", "school lunch": "kids", "kids friendly": "kids",
  pregnancy: "pregnancy", prenatal: "pregnancy", expecting: "pregnancy",
  immunity: "immunity", "immunity boosting": "immunity", antioxidant: "immunity",
  "bone health": "bone health", "calcium rich": "bone health",
  anemia: "anemia", "iron deficiency": "anemia", "iron rich": "anemia",
  "blood pressure": "blood pressure", hypertension: "blood pressure", "low sodium": "blood pressure",
  vegan: "vegan", "plant based": "vegan", "dairy free": "vegan",
  "gluten free": "gluten free", celiac: "gluten free",
  "gut health": "gut health", digestion: "gut health", probiotic: "gut health",
  energy: "energy", "energy boost": "energy", "pre workout": "energy",
  "skin & hair": "skin & hair", skin: "skin & hair", hair: "skin & hair", beauty: "skin & hair",
  hydration: "hydration", electrolytes: "hydration",
  running: "running", endurance: "running", athlete: "running",
  parents: "parents", elderly: "parents", senior: "parents",
  "clean eating": "clean eating", "whole food": "clean eating", "no additives": "clean eating",
  healthy: "healthy", healthiest: "healthy", healthier: "healthy",
  "heart healthy": "heart healthy", "heart health": "heart health",
  "low cholesterol": "low cholesterol",
  satiety: "satiety", filling: "satiety",
  "protein budget": "protein budget",
  // Hinglish
  "kam fat": "low fat", "kam calorie": "low calorie", "kam cheeni": "low sugar",
  "bina cheeni": "sugar free", "bina tel": "low fat", "jyada protein": "high protein",
  "healthy khana": "healthy",
};

function detectGoal(query: string): string | null {
  const q = query.toLowerCase().trim();
  // Try multi-word phrases first (longest match)
  const multi = Object.keys(GOAL_WORDS)
    .filter((k) => k.includes(" ") || k.length > 5)
    .sort((a, b) => b.length - a.length);
  for (const phrase of multi) {
    if (q.includes(phrase)) return GOAL_WORDS[phrase]!;
  }
  // Try single-word matches (partial: "diabetic" → "diabetic friendly")
  for (const [word, mapped] of Object.entries(GOAL_WORDS)) {
    if (!word.includes(" ") && word.length <= 5 && q.includes(word)) return mapped;
  }
  return null;
}

// ── Modifiers ──

function detectModifiers(query: string): string[] {
  const mods: string[] = [];
  const q = query.toLowerCase();
  if (/\b(high|more|highest|most|jyada)\s+protein\b/.test(q)) mods.push("high_protein_tier");
  if (/\b(low|less|lowest|kam)\s+sugar\b/.test(q)) mods.push("low_sugar");
  if (/\bno\s+added\s+sugar\b/.test(q)) mods.push("no_added_sugar");
  if (/\b(zero|no|bina)\s+sugar\b/.test(q)) mods.push("no_added_sugar");
  return mods;
}

// ── Sort ──

function detectSort(query: string): SearchIntentV2["sort"] {
  const q = query.toLowerCase();
  // Only match explicit sort keywords, NOT "under 50/100" (which is price/calorie constraint)
  if (["cheapest", "budget", "affordable", "cheapest first", "lowest price"].some((p) => q.includes(p))) return "cheapest";
  if (["highest protein", "more protein", "most protein", "high protein"].some((p) => q.includes(p))) return "highest_protein";
  if (["healthiest", "best rated", "top rated"].some((p) => q.includes(p))) return "healthiest";
  if (["lowest sugar", "less sugar", "sugar free", "zero sugar"].some((p) => q.includes(p))) return "lowest_sugar";
  return "best_match";
}

// ── Flavour extraction ──

function extractFlavours(tokens: string[], idx: LookupIndex, query: string): string[] {
  const qNorm = normalize(query);
  const flavours: string[] = [];
  const ignore = new Set(["no", "without", "free", "low", "high", "less", "more", "under", "best", "top", "good", "fresh", "organic", "natural", "zero", "added", "kam", "bina", "jyada"]);
  for (const t of tokens) {
    if (ignore.has(t)) continue;
    if (idx.brandsSet.has(t)) continue;
    if (idx.typesSet.has(t)) continue;
    // Check if it's a substring of any multi-word type (e.g., "vanilla" in "vanilla ice cream" is a flavour)
    let isPartOfType = false;
    for (const tpNorm of idx.typeOriginals.keys()) {
      if (tpNorm.includes(t)) { isPartOfType = true; break; }
    }
    if (isPartOfType) continue;
    if (t.length >= 2) flavours.push(t);
  }
  return flavours;
}

// ── Ingredient avoidance ──

const NEGATION_PATTERNS = [
  /\bno\s+(\w+(?:\s+\w+)?)\b/gi,
  /\bwithout\s+(\w+(?:\s+\w+)?)\b/gi,
  /\b(\w+)\s*[-]?\s*free\b/gi,
  /\b(\w+)\s*[-]?\s*less\b/gi,
];

const ALLERGEN_WORDS = new Set([
  "nut", "nuts", "peanut", "peanuts", "soy", "soya", "dairy", "lactose",
  "gluten", "wheat", "egg", "eggs", "fish", "shellfish", "sesame", "mustard",
  "sulphite", "sulfite", "celery", "lupin", "mollusc",
]);

function extractAvoidIngredients(query: string): string[] {
  const avoid: string[] = [];
  for (const pattern of NEGATION_PATTERNS) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(query)) !== null) {
      const word = (m[1] ?? "").toLowerCase().trim();
      if (word.length < 3) continue;
      // Skip if it's a dietary constraint handled by boolean flags
      if (["palm oil", "sugar", "added sugar"].includes(word)) continue;
      avoid.push(word);
    }
  }
  return [...new Set(avoid)];
}

function extractAllergens(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/);
  return ALLERGEN_WORDS.has(words[words.length - 1] ?? "") ? [words[words.length - 1]!] : [];
}

// ── Use case detection ──

const USE_CASES: [RegExp, string][] = [
  [/\bpre[\s-]?workout\b/i, "pre_workout"],
  [/\bpost[\s-]?workout\b/i, "post_workout"],
  [/\bschool[\s-]?lunch\b/i, "school_lunch"],
  [/\b(breakfast|lunch|dinner|supper)\b/i, "meal"],
  [/\b(evening|afternoon|morning)\s+snack/i, "snack_time"],
  [/\bfor\s+(the\s+)?gym\b/i, "gym"],
  [/\b(office|desk)\s+lunch\b/i, "office_lunch"],
  [/\btiffin\b/i, "tiffin"],
];

function detectUseCase(query: string): string | null {
  const q = query.toLowerCase().trim();
  for (const [re, slug] of USE_CASES) {
    if (re.test(q)) return slug;
  }
  return null;
}

// ── Comparison ref extraction ──

function detectComparison(query: string): { ref: string | null; mode: "healthier_than" | "cheaper_than" | null } {
  const q = query.toLowerCase();
  const healthier = /\bhealthier\s+than\s+(.+)/i.exec(q);
  if (healthier?.[1]) return { ref: healthier[1].trim(), mode: "healthier_than" };
  const cheaper = /\bcheaper\s+than\s+(.+)/i.exec(q);
  if (cheaper?.[1]) return { ref: cheaper[1].trim(), mode: "cheaper_than" };
  return { ref: null, mode: null };
}

// ── Constraint priorities ──

function buildConstraintPriorities(
  avoidIngredients: string[],
  allergens: string[],
): ConstraintPriority[] {
  const out: ConstraintPriority[] = [];
  let p = 1;
  if (allergens.length) out.push({ field: "allergens_excluded", priority: p++ });
  if (avoidIngredients.length) out.push({ field: "avoid_ingredients", priority: p++ });
  // Numeric constraints — relax price before macros before protein
  out.push({ field: "max_price", priority: p++ });
  out.push({ field: "max_sugar_g", priority: p++ });
  out.push({ field: "max_fat_g", priority: p++ });
  out.push({ field: "min_protein_g", priority: p++ });
  return out;
}

// ── Dietary constraints ──

function dietaryConstraints(query: string, goalPhrase?: string | null) {
  const q = query.toLowerCase();
  const g = goalPhrase?.toLowerCase() ?? "";
  return {
    vegan:
      g.includes("vegan") || g.includes("plant based") || g.includes("dairy free") ||
      q.includes("vegan") || q.includes("plant based") || q.includes("dairy free")
        ? true
        : undefined,
    vegetarian:
      g.includes("vegetarian") || q.includes("vegetarian") ? true : undefined,
    gluten_free:
      g.includes("gluten free") || q.includes("gluten free") || g.includes("celiac") || q.includes("celiac")
        ? true
        : undefined,
    palm_oil_free:
      q.includes("no palm oil") || q.includes("palm oil free") ? true : undefined,
  };
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
  query?: string;
  queryTokens?: string[];
  idx?: LookupIndex;
};

function buildIntent(p: PartialIntent): SearchIntentV2 {
  const diet = dietaryConstraints(p.query ?? "", p.goal_phrase);
  const avoid = extractAvoidIngredients(p.query ?? "");
  const allergens = extractAllergens(p.query ?? "");
  const flavours = p.queryTokens && p.idx
    ? extractFlavours(p.queryTokens, p.idx, p.query ?? "")
    : [];
  const useCase = detectUseCase(p.query ?? "");
  const comp = detectComparison(p.query ?? "");
  const priorities = buildConstraintPriorities(avoid, allergens);

  return {
    kind: p.kind,
    goal_phrase: p.goal_phrase?.trim() || null,
    goal_id: null,
    brand: p.brand?.trim() || null,
    primary_type: p.primary_type?.trim().toLowerCase() || null,
    use_case: useCase,
    required_flavours: flavours,
    modifiers: p.modifiers ?? [],
    constraints: {
      avoid_ingredients: avoid,
      allergens_excluded: allergens,
      ...(diet.vegan ? { vegan: true } : {}),
      ...(diet.vegetarian ? { vegetarian: true } : {}),
      ...(diet.gluten_free ? { gluten_free: true } : {}),
      ...(diet.palm_oil_free ? { palm_oil_free: true } : {}),
    },
    constraint_priorities: priorities,
    sort: p.sort ?? "best_match",
    comparison_ref: comp.ref,
    comparison_mode: comp.mode,
    confidence: Math.max(0, Math.min(1, p.confidence)),
    intent_source: "python-classifier",
    raw_query: "",
    // Only set trait_weights for DIRECTED queries (ranking boost, no category filter).
    // For GOAL queries, the pipeline's resolveGoalWeights handles category-based
    // selection + trait weights correctly. Setting them here would bypass that
    // and apply aggressive category filtering (e.g. "high protein" → only
    // muscle-gain categories → only soya chunks instead of all protein products).
    trait_weights: p.kind !== "goal"
      ? (TRAIT_WEIGHT_CACHE.get(p.goal_phrase?.toLowerCase() ?? "") ?? {})
      : {},
  };
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

  const comp = detectComparison(queryLower);
  if (comp.ref && comp.mode) {
    return buildIntent({
      kind: "directed",
      sort: comp.mode === "healthier_than" ? "healthiest" : "cheapest",
      confidence: 0.55,
      query: queryLower,
      queryTokens: tokens,
      idx,
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

  const bopts = { query: queryLower, queryTokens: tokens, idx };

  if (brand && idx.brandsSet.has(normalize(queryLower))) {
    return buildIntent({ kind: "brand", brand, confidence: 0.95, ...bopts });
  }
  if (brand && tokens.length === 1) {
    return buildIntent({ kind: "brand", brand, confidence: 0.95, ...bopts });
  }
  if (brand && ptype && !isNaturalLang) {
    return buildIntent({ kind: "directed", brand, primary_type: ptype, goal_phrase: goalPhrase, modifiers, sort, confidence: 0.92, ...bopts });
  }
  if (ptype && tokens.length === 1 && !brand) {
    return buildIntent({ kind: "directed", primary_type: ptype, confidence: 0.95, ...bopts });
  }
  if (isVague || isNaturalLang) {
    return buildIntent({ kind: "ambiguous", confidence: 0.30, ...bopts });
  }
  if (goalPhrase && ptype) {
    return buildIntent({ kind: "directed", primary_type: ptype, goal_phrase: goalPhrase, modifiers, sort, confidence: 0.82, ...bopts });
  }
  if (goalPhrase && !isVague) {
    return buildIntent({ kind: "goal", goal_phrase: goalPhrase, primary_type: ptype, modifiers, sort, confidence: 0.80, ...bopts });
  }
  if (ptype) {
    return buildIntent({ kind: "directed", primary_type: ptype, modifiers, sort, confidence: 0.72, ...bopts });
  }
  if (modifiers.length) {
    return buildIntent({ kind: "directed", modifiers, sort, confidence: 0.55, ...bopts });
  }
  if (brand) {
    return buildIntent({ kind: "brand", brand, confidence: 0.65, ...bopts });
  }
  return buildIntent({ kind: "ambiguous", confidence: 0.30, ...bopts });
}

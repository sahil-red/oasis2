import {
  CATEGORY_DEFAULT_ROLE,
  normTaxonomyLabel,
  SUBCATEGORY_ROLE,
} from "@/lib/scoring/role-cohort-taxonomy";

export type RoleCohort = "staple" | "snack" | "treat" | "meal_replacement" | "adjunct";

export type RoleCohortInput = {
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
};

/** Plain / zero-calorie drinks — never treats. Checked before generic soda rules. */
const PLAIN_WATER_NAME_RE =
  /\b(soda water|sparkling water|carbonated water|club soda|seltzer|tonic water|mineral water|drinking water|spring water|coconut water|plain water|table water)\b/i;

/** Sweet soda / cola in product name (name-only — not category haystack). */
const SWEET_SODA_NAME_RE =
  /\b(cola|pepsi|thums up|thumbs up|sprite|fanta|mountain dew|7up|7-up|mirinda|limca|maaza|frooti|appy|paper boat.*juice|red bull|monster energy)\b/i;

/** Generic "soda" in name but not plain water. */
const GENERIC_SODA_NAME_RE = /\bsoda\b/i;

const SNACK_NAME_RE =
  /\b(chip|chips|crisp|namkeen|bhujia|kurkure|wafer|biscuit|cookie|cracker|rusk)\b/i;

const DESSERT_CAKE_RE =
  /\b(?<!rice |oat |oats |ragi |bajra |jowar |multigrain |wholegrain |whole grain |fish |chicken |veg |paneer |corn )(cake|pastry|brownie|cupcake|muffin)s?\b/i;

const TREAT_NAME_RE =
  /\b(chocolate|candy|ice cream|kulfi|toffee|gummies|gummy|sweet treat|dessert|soft drink|sweetened|tetra juice)\b/i;

const MEAL_REPLACEMENT_NAME_RE =
  /\b(protein bar|energy bar|ready to eat|rte|instant noodle|maggi|meal kit|breakfast cereal)\b/i;

const STAPLE_NAME_RE =
  /\b(milk|dahi|yogurt|curd|paneer|egg|anda|chicken|fish|meat|prawn|dal|atta|flour|millets?|oats|fruit|vegetable|produce|bread|roti|chapati|pav)\b/i;

/** Cooking oils, spices, condiments — product name only. */
const ADJUNCT_NAME_RE =
  /\b(mustard oil|olive oil|sunflower oil|groundnut oil|peanut oil|coconut oil|sesame oil|soyabean oil|soybean oil|rice bran oil|canola oil|vegetable oil|refined oil|wood cold pressed|cold pressed oil|ghee|vanaspati|tea powder|chai masala|coffee powder|instant coffee|masala powder|spice mix|seasoning|hing|turmeric powder|coriander powder|chilli powder|garam masala|chaat masala|vinegar|soy sauce|ketchup|pickle|achaar|chutney)\b/i;

function roleFromSubcategory(sub: string, name: string): RoleCohort | null {
  const key = normTaxonomyLabel(sub);
  if (key === "soda & mixers") {
    if (PLAIN_WATER_NAME_RE.test(name)) return "staple";
    if (SWEET_SODA_NAME_RE.test(name)) return "treat";
    if (GENERIC_SODA_NAME_RE.test(name) && !PLAIN_WATER_NAME_RE.test(name)) return "treat";
    // Unspecified mixers / tonic → treat
    return "treat";
  }
  return SUBCATEGORY_ROLE[key] ?? null;
}

function roleFromCategoryDefault(cat: string): RoleCohort | null {
  return CATEGORY_DEFAULT_ROLE[normTaxonomyLabel(cat)] ?? null;
}

/**
 * Infer how the product is used in a diet (staple vs treat vs adjunct…).
 *
 * Priority: name exceptions → subcategory map → name patterns → category default → staple.
 * Never match short tokens (oil, soda, tea, rice) against combined category+name haystacks.
 */
export function inferRoleCohort(opts: RoleCohortInput): RoleCohort {
  const name = (opts.name ?? "").toLowerCase();
  const cat = (opts.category ?? "").trim();
  const sub = (opts.subcategory ?? "").trim();

  if (PLAIN_WATER_NAME_RE.test(name)) return "staple";

  if (sub) {
    const fromSub = roleFromSubcategory(sub, name);
    if (fromSub) return fromSub;
  }

  if (ADJUNCT_NAME_RE.test(name)) return "adjunct";

  if (SNACK_NAME_RE.test(name)) return "snack";

  if (TREAT_NAME_RE.test(name) || DESSERT_CAKE_RE.test(name)) return "treat";
  if (SWEET_SODA_NAME_RE.test(name)) return "treat";
  if (GENERIC_SODA_NAME_RE.test(name) && !PLAIN_WATER_NAME_RE.test(name)) return "treat";

  if (MEAL_REPLACEMENT_NAME_RE.test(name)) return "meal_replacement";

  if (STAPLE_NAME_RE.test(name)) return "staple";

  if (cat) {
    const fromCat = roleFromCategoryDefault(cat);
    if (fromCat) return fromCat;
  }

  return "staple";
}

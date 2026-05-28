import type { RoleCohort } from "@/lib/scoring/role-cohort";

/** Normalize shelf labels for map lookup. */
export function normTaxonomyLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Zepto subcategory → role. Primary signal; avoids false positives from
 * category strings like "Atta, Rice, Oil & Dals" containing "oil" or "rice".
 */
export const SUBCATEGORY_ROLE: Record<string, RoleCohort> = {
  // Atta, Rice, Oil & Dals
  "rice & more": "staple",
  "dals & pulses": "staple",
  atta: "staple",
  "millets & other flours": "staple",
  "besan, sooji & maida": "staple",
  oil: "adjunct",
  ghee: "adjunct",

  // Dairy
  "breads & buns": "staple",
  "indian breads": "staple",
  milk: "staple",
  eggs: "staple",
  cheese: "staple",
  "paneer & cream": "staple",
  "curd & probiotic drink": "staple",
  "yogurt & shrikhand": "staple",
  butter: "staple",
  "batters & mixes": "staple",

  // Masala aisle
  "powders & pastes": "adjunct",
  "whole spices & seasonings": "adjunct",
  "salt, sugar & jaggery": "adjunct",
  "dry fruits & nuts": "snack",
  "dates & seeds": "snack",
  "dehydrated & dried": "adjunct",

  // Munchies / biscuits
  "chips & crisps": "snack",
  namkeens: "snack",
  popcorn: "snack",
  nachos: "snack",
  "energy bars": "snack",
  "dry fruits & nuts munchies": "snack",
  cookies: "snack",
  creamfills: "snack",
  wafers: "snack",
  crackers: "snack",
  "rusk & khari": "snack",
  "glucose & marie": "snack",

  // Sweet / ice cream
  "indian mithai": "treat",
  chocolates: "treat",
  "premium chocolates": "treat",
  "candies, gums & mints": "treat",
  "pastries & cakes": "treat",
  tubs: "treat",
  cups: "treat",
  sticks: "treat",
  cones: "treat",
  kulfi: "treat",
  "cakes, sandwiches & more": "treat",

  // Drinks
  "soft drinks": "treat",
  "fruit juices & drinks": "treat",
  "milk drinks": "treat",
  "cold coffee & iced tea": "treat",
  "energy drink": "treat",
  "instant drink mixes": "treat",
  "milk based drinks": "treat",
  "vegan drinks": "treat",
  "hydration drinks": "staple",
  // soda & mixers: resolved by name (plain water vs sweet mixers)

  // Tea / coffee (powder & leaves = adjunct; RTD handled above)
  tea: "adjunct",
  coffee: "adjunct",
  "green & herbal tea": "adjunct",
  "drink mixes": "adjunct",

  // Packaged / breakfast
  "noodles & vericelli": "meal_replacement",
  "noodles & vermicelli": "meal_replacement",
  "ready to eat": "meal_replacement",
  "ready to cook": "meal_replacement",
  "breakfast cereals": "meal_replacement",
  "muesli & oats": "meal_replacement",
  "pasta & soups": "meal_replacement",
  "infant food": "meal_replacement",
  "papads, pickles & chutney": "adjunct",
  "ketchup & sauces": "adjunct",
  "honey & spreads": "snack",
  "peanut butter": "snack",
  "baking mixes & ingredients": "meal_replacement",
  "dessert mixes": "treat",

  // Frozen / meat
  "frozen veggies & pulp": "staple",
  "veg snacks": "snack",
  "non veg snacks": "snack",
  "raw meats": "staple",
  "marinades & snacks": "snack",
};

/** Category-level default when subcategory is missing or unmapped. */
export const CATEGORY_DEFAULT_ROLE: Record<string, RoleCohort> = {
  "sweet cravings": "treat",
  "ice creams & more": "treat",
  munchies: "snack",
  biscuits: "snack",
  "cold drinks & juices": "treat",
  "atta, rice, oil & dals": "staple",
  "dairy, bread & eggs": "staple",
  "masala, dry fruits & more": "adjunct",
  "tea, coffee & more": "adjunct",
  "breakfast & sauces": "meal_replacement",
  "packaged food": "meal_replacement",
  "frozen food": "snack",
  "meats, fish & eggs": "staple",
};

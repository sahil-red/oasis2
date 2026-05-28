export type RoleCohort = "staple" | "snack" | "treat" | "meal_replacement" | "adjunct";

export function inferRoleCohort(opts: {
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
}): RoleCohort {
  const name = (opts.name ?? "").toLowerCase();
  const cat = (opts.category ?? "").toLowerCase();
  const sub = (opts.subcategory ?? "").toLowerCase();
  const hay = `${name} ${cat} ${sub}`;

  // Plain bubbly water (soda water, sparkling water, club soda) — NOT treats.
  // Must come before treat regex which would match `\bsoda\b`.
  if (
    /\b(soda water|sparkling water|carbonated water|club soda|seltzer|mineral water|drinking water|spring water)\b/i.test(name)
  ) {
    return "staple";
  }

  // Adjuncts: seasonings, oils, condiments, tea/coffee. Identified by NAME or
  // SUBCATEGORY only — NOT category — because "Atta, Rice, Oil & Dals" contains
  // the word "oil" and would falsely flag flour/rice/dal as adjuncts.
  const adjunctNameRe =
    /\b(tea|chai|coffee|masala|spice|seasoning|hing|turmeric|coriander|chilli powder|garam|chaat masala|essence|flavouring|flavoring|oil|ghee|vinegar|soy sauce|ketchup|chutney|pickle|achaar)\b/i;
  const adjunctSubRe =
    /\b(masala|spice|powder|paste|oil|ghee|vinegar|condiment|pickle|chutney|seasoning|tea|coffee)\b/i;
  if (
    (adjunctNameRe.test(name) || adjunctSubRe.test(sub)) &&
    !/\b(biscuit|cookie|chip|chocolate|noodle|dahi|milk|bread|paneer|cake)\b/i.test(name)
  ) {
    return "adjunct";
  }

  if (
    /\b(chip|chips|crisp|namkeen|bhujia|kurkure|wafer|biscuit|cookie|cracker|rusk)\b/i.test(
      hay,
    )
  ) {
    return "snack";
  }

  // "rice cakes", "oat cakes", "ragi cake", "fish cake" etc. are NOT desserts.
  // Match the dessert sense of "cake" only when not preceded by a grain/savoury word.
  const dessertCakeRe = /\b(?<!rice |oat |oats |ragi |bajra |jowar |multigrain |wholegrain |whole grain |fish |chicken |veg |paneer |corn )(cake|pastry|brownie|cupcake|muffin)s?\b/i;
  if (
    /\b(chocolate|candy|ice cream|kulfi|toffee|gummies|gummy|sweet treat|dessert|cola|soda|soft drink|sweetened|tetra juice|cold drink)\b/i.test(
      hay,
    ) ||
    dessertCakeRe.test(name) ||
    /\b(Sweet Tooth|Chocolates|Ice Cream|Desserts?)\b/i.test(cat)
  ) {
    return "treat";
  }

  if (
    /\b(protein bar|energy bar|ready to eat|rte|instant noodle|maggi|meal kit|breakfast cereal)\b/i.test(
      hay,
    )
  ) {
    return "meal_replacement";
  }

  if (
    /\b(milk|dahi|yogurt|curd|paneer|egg|anda|chicken|fish|meat|prawn|dal|atta|rice|oats|fruit|vegetable|produce|bread|roti|chapati|pav)\b/i.test(
      hay,
    ) ||
    /\b(Dairy|Eggs|Chicken|Meat|Fish|Fruits|Vegetables|Atta|Rice|Pulses)\b/i.test(cat)
  ) {
    return "staple";
  }

  if (/\b(Snacks|Munchies|Namkeen)\b/i.test(cat)) return "snack";
  if (/\b(Cold Drinks|Juices|Beverages)\b/i.test(cat)) return "treat";

  return "staple";
}

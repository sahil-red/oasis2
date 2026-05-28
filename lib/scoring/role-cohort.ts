export type RoleCohort = "staple" | "snack" | "treat" | "meal_replacement" | "adjunct";

export function inferRoleCohort(opts: {
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
}): RoleCohort {
  const name = (opts.name ?? "").toLowerCase();
  const cat = `${opts.category ?? ""} ${opts.subcategory ?? ""}`.toLowerCase();
  const hay = `${name} ${cat}`;

  if (
    /\b(tea|chai|coffee|masala|spice|seasoning|hing|turmeric|coriander|chilli powder|garam|chaat masala|oil\b|ghee|vinegar|soy sauce|ketchup|chutney|pickle|achaar|essence|flavouring|flavoring)\b/i.test(
      hay,
    ) &&
    !/\b(biscuit|cookie|chip|chocolate|noodle|dahi|milk|bread|paneer)\b/i.test(name)
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

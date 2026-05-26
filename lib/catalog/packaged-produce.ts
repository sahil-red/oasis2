/**
 * Detect packaged / processed foods that must not be treated as fresh produce
 * for category mapping, reference seeding, or produce-style scoring.
 */
const PACKAGED_PRODUCE_RE =
  /\b(bun|buns|bread|biscuit|biscuits|cookie|cookies|cake|cakes|jam|jelly|spread|milk|yogurt|curd|dahi|juice|juices|drink|drinks|soda|cola|chips|namkeen|snack|snacks|bar|bars|mix|powder|syrup|candy|chocolate|ice cream|frozen|pickle|sauce|ketchup|noodle|pasta|cereal|muesli|granola|smoothie|shake|tea|coffee|cream|butter|cheese|paneer|egg|eggs|chicken|fish|meat|mutton|puff|wafer|cracker|crackers|pizza|burger|sandwich|muffin|pastry|donut|doughnut|kulfi|lollipop|gummy|horlicks|boost|complan|protein|whey|gainer|supplement|processed|instant|ready to eat|fried|roasted|salted|flavou?red|flavor|masala|spice|oil|ghee|atta|flour|rice|dal|pulse|lentil|honey|marmalade|preserve|can|tin|bottle|pet|pouch|sachet|chewing gum|gum|nectar|pulp|beverage|health drink|malt|murukku|papad|namkeen|trail mix|panchmeva|dry fruits mix|fruit bun|nut mix|cookies|rusk|pav|muffin)\b/i;

const FRESH_PRODUCE_SHELF_RE =
  /^(fresh fruits?|fresh vegetables?|leafy|herbs|exotic fruits?|seasonal fruits?|apples?|banana|mango|onion|tomato|potato|capsicum|carrot|beans|cabbage|cauliflower|broccoli|spinach|coriander|mint|ginger|garlic|lemon|lime|orange|papaya|guava|watermelon|pomegranate|grapes?|pineapple|strawberry|kiwi|pear|plum|peach|beetroot|cucumber|pumpkin|gourd|drumstick|mushroom|lettuce|avocado|cherry|sapota|chikoo|jackfruit|raw banana|plantain|sweet corn|baby corn|green peas|cluster beans|ivy gourd|bitter gourd|bottle gourd|ridge gourd|snake gourd|sponge gourd|ladies finger|okra|brinjal|eggplant|radish|turnip|beet|amaranth|methi|fenugreek|curry leaves|drumsticks?)$/i;

/** True when the name or shelf clearly indicates packaged food, not whole produce. */
export function isPackagedProduceLike(
  name: string | null | undefined,
  subcategory?: string | null,
): boolean {
  const blob = `${name ?? ""} ${subcategory ?? ""}`;
  return PACKAGED_PRODUCE_RE.test(blob);
}

/** True when subcategory looks like a genuine fresh-produce shelf (not fruit bun, dry mix, juice, etc.). */
export function isFreshProduceShelf(subcategory: string | null | undefined): boolean {
  if (!subcategory?.trim()) return false;
  const s = subcategory.trim();
  if (isPackagedProduceLike(null, s)) return false;
  return FRESH_PRODUCE_SHELF_RE.test(s);
}

/** For goal/scoring: fresh whole food, not packaged goods in a bad aisle. */
export function isFreshWholeProduce(opts: {
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
}): boolean {
  const cat = `${opts.category ?? ""} ${opts.subcategory ?? ""}`;
  if (!/fresh fruits?|fresh vegetables?|fruits?\s*&\s*vegetables?/i.test(cat)) {
    return false;
  }
  if (isPackagedProduceLike(opts.name, opts.subcategory)) return false;
  if (opts.subcategory && !isFreshProduceShelf(opts.subcategory)) {
    // Allow if subcategory is empty-ish but name is a single produce item — handled by reference match elsewhere.
    if (isPackagedProduceLike(opts.name, null)) return false;
  }
  return true;
}

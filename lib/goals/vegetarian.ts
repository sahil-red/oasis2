/** Meat, fish, and explicit non-veg — allowed in lacto-vegetarian (veg) mode. */
const MEAT_FISH =
  /\b(fish|chicken|mutton|beef|pork|lamb|prawn|shrimp|crab|lobster|meat|seafood|non[- ]?veg|non vegetarian)\b/i;

const EGG =
  /\b(eggs?|egg white|egg yolk|egg albumin|lysozyme|ovalbumin)\b/i;

export function dietLabel(attrs: Record<string, string> | null): string {
  return (
    attrs?.["Diet Preference"] ??
    attrs?.["Diet"] ??
    attrs?.["Food Preference"] ??
    ""
  );
}

export function hasMeatOrFish(opts: {
  ingredients_raw: string | null;
  attributes?: Record<string, string> | null;
  product_name?: string | null;
}): boolean {
  const diet = dietLabel(opts.attributes ?? null);
  if (/non[- ]?veg|non vegetarian|contains meat|fish|chicken|mutton/i.test(diet)) {
    return true;
  }
  const text = [opts.ingredients_raw ?? "", opts.product_name ?? ""].join(" ");
  return MEAT_FISH.test(text);
}

export function hasEggs(opts: {
  ingredients_raw: string | null;
  attributes?: Record<string, string> | null;
}): boolean {
  const diet = dietLabel(opts.attributes ?? null);
  if (/contains egg|with egg/i.test(diet)) return true;
  const text = opts.ingredients_raw ?? "";
  return EGG.test(text);
}

export function isVegetarianCompatible(
  opts: {
    ingredients_raw: string | null;
    attributes?: Record<string, string> | null;
    product_name?: string | null;
  },
  allowEggs: boolean,
): { ok: boolean; reason?: string } {
  if (hasMeatOrFish(opts)) {
    return { ok: false, reason: "Contains meat or fish — not vegetarian" };
  }
  if (!allowEggs && hasEggs(opts)) {
    return { ok: false, reason: "Contains egg — excluded in your veg settings" };
  }
  return { ok: true };
}

export function vegetarianLabelHint(attrs: Record<string, string> | null): boolean {
  const diet = dietLabel(attrs);
  return (
    /(^|\s)(pure )?veg(etarian)?(\s|$)/i.test(diet) &&
    !/non[- ]?veg|non vegetarian/i.test(diet)
  );
}

const ANIMAL =
  /\b(milk|whey|casein|egg|honey|gelatin|ghee|butter|cheese|fish|chicken|mutton|beef|pork|lactose|paneer|curd|yogurt|yoghurt)\b/i;

export function hasAnimalDerived(opts: {
  ingredients_raw: string | null;
  attributes?: Record<string, string> | null;
  product_name?: string | null;
}): boolean {
  const text = [opts.ingredients_raw ?? "", opts.product_name ?? ""].join(" ");
  const attrs = opts.attributes ?? null;
  const diet =
    attrs?.["Diet Preference"] ??
    attrs?.["Diet"] ??
    attrs?.["Food Preference"] ??
    "";
  if (/non[- ]?veg|contains egg|egg\b|non vegetarian/i.test(diet)) return true;
  return ANIMAL.test(text);
}

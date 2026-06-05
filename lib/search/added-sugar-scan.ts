const ADDED_SUGAR_INGREDIENT =
  /\b(sugar|sucrose|glucose|fructose|dextrose|maltose|jaggery|gur|honey|syrup|invert syrup|corn syrup|high fructose|hfcs|molasses|treacle|brown sugar|caster sugar|icing sugar)\b/i;

/** Heuristic: sweeteners listed as ingredients (not just nutrition field). */
export function ingredientsSuggestAddedSugar(ingredients: string | null | undefined): boolean {
  if (!ingredients?.trim()) return false;
  return ADDED_SUGAR_INGREDIENT.test(ingredients);
}

export function passesNoAddedSugarRule(opts: {
  ingredients_raw: string | null | undefined;
  added_sugar_g_100g: number | null;
  verdict_sublabels?: string[];
}): boolean {
  if (opts.added_sugar_g_100g != null && opts.added_sugar_g_100g > 0.5) return false;
  const subs = opts.verdict_sublabels ?? [];
  if (subs.includes("high_sugar") || subs.includes("hidden_sweetener")) return false;
  if (ingredientsSuggestAddedSugar(opts.ingredients_raw)) return false;
  return true;
}

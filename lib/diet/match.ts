import type { ProductListItem } from "@/lib/products/queries";
import { hasMeatOrFish, hasEggs, vegetarianLabelHint } from "@/lib/goals/vegetarian";
import { hasAnimalDerived } from "@/lib/goals/vegan";
import type { DietMode } from "./types";

export type DietBadge = "veg" | "veg-eggs" | "non-veg" | "vegan";

/** Best-effort diet badge for one product — pure regex/attribute heuristics. */
export function productDietBadge(p: {
  ingredients_raw: string | null;
  attributes?: Record<string, string> | null;
  name?: string | null;
}): DietBadge {
  const product_name = p.name ?? null;
  const opts = {
    ingredients_raw: p.ingredients_raw,
    attributes: p.attributes ?? null,
    product_name,
  };
  if (hasMeatOrFish(opts)) return "non-veg";
  if (hasAnimalDerived({ ...opts })) {
    return hasEggs(opts) ? "veg-eggs" : "veg";
  }
  if (hasEggs(opts)) return "veg-eggs";
  return "vegan";
}

export function dietBadgeLabel(b: DietBadge): string {
  switch (b) {
    case "non-veg":
      return "Non-veg";
    case "veg-eggs":
      return "Veg + eggs";
    case "vegan":
      return "Plant-based";
    case "veg":
      return "Vegetarian";
  }
}

export function isDietCompatible(
  diet: DietMode,
  p: {
    ingredients_raw: string | null;
    attributes?: Record<string, string> | null;
    name?: string | null;
  },
): { ok: boolean; reason?: string } {
  if (diet === "any") return { ok: true };
  const opts = {
    ingredients_raw: p.ingredients_raw,
    attributes: p.attributes ?? null,
    product_name: p.name ?? null,
  };

  if (diet === "veg" || diet === "veg-eggs") {
    if (hasMeatOrFish(opts)) {
      return { ok: false, reason: "Contains meat or fish" };
    }
    if (diet === "veg" && hasEggs(opts)) {
      return { ok: false, reason: "Contains egg" };
    }
    return { ok: true };
  }

  if (diet === "vegan") {
    if (hasAnimalDerived(opts)) {
      return { ok: false, reason: "Has animal-derived ingredients" };
    }
    return { ok: true };
  }
  return { ok: true };
}

export function hasVegetarianPackHint(p: {
  attributes?: Record<string, string> | null;
}): boolean {
  return vegetarianLabelHint(p.attributes ?? null);
}

/** Filter a list down to products matching the given diet. */
export function filterByDiet<T extends Pick<ProductListItem, "ingredients_raw" | "attributes" | "name">>(
  diet: DietMode,
  list: T[],
): T[] {
  if (diet === "any") return list;
  return list.filter((p) => isDietCompatible(diet, p).ok);
}

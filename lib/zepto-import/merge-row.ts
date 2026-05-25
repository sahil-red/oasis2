import { isPlatformNutritionComplete } from "@/lib/nutrition/completeness";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { ZeptoCsvRow } from "@/lib/zepto-import/csv-row";

export type ExistingProduct = {
  id: string;
  image_urls: string[] | null;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  attributes: Record<string, string> | null;
};

export function mergeCsvWithExisting(
  csv: ZeptoCsvRow,
  existing: ExistingProduct | null,
  fallbackImages: string[],
): {
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  image_urls: string[];
  attributes: Record<string, string>;
} {
  const images =
    (csv.image_urls.length ? csv.image_urls : null) ??
    (existing?.image_urls?.length ? existing.image_urls : null) ??
    (fallbackImages.length ? fallbackImages : []);

  let ingredients_raw = csv.ingredients_raw;
  let nutrition = csv.nutrition;

  if (
    existing &&
    isPlatformNutritionComplete(existing.ingredients_raw, existing.nutrition) &&
    !isPlatformNutritionComplete(csv.ingredients_raw, csv.nutrition)
  ) {
    ingredients_raw = existing.ingredients_raw ?? ingredients_raw;
    nutrition = existing.nutrition ?? nutrition;
  } else if (
    isPlatformNutritionComplete(csv.ingredients_raw, csv.nutrition) &&
    existing &&
    !isPlatformNutritionComplete(existing.ingredients_raw, existing.nutrition)
  ) {
    // prefer CSV
  } else if (existing) {
    ingredients_raw = ingredients_raw ?? existing.ingredients_raw;
    nutrition = nutrition ?? existing.nutrition;
  }

  const attributes: Record<string, string> = {
    ...((existing?.attributes ?? {}) as Record<string, string>),
    "L3 Category": csv.l3_category ?? "",
    "Data Source": "zepto_csv",
    "Variant ID": csv.zepto_sku,
  };

  return {
    ingredients_raw,
    nutrition,
    image_urls: images,
    attributes,
  };
}

import { isPlatformNutritionComplete, countNutritionFields } from "@/lib/nutrition/completeness";
import { sanitizeNutrition } from "@/lib/nutrition/anomaly";
import type { ProductNutrition } from "@/lib/supabase/types";
import { normalizeProductImageUrls } from "@/lib/products/catalog-hero-image";
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
    isPlatformNutritionComplete(csv.ingredients_raw, csv.nutrition) ||
    (csv.nutrition &&
      countNutritionFields(csv.nutrition) >
        countNutritionFields(existing?.nutrition ?? null))
  ) {
    // Prefer CSV when label-grade complete or strictly richer than existing row.
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

  if (nutrition) {
    nutrition = sanitizeNutrition(nutrition, {
      name: csv.name,
      category: csv.category,
      subcategory: csv.subcategory,
    });
  }

  return {
    ingredients_raw,
    nutrition,
    image_urls: normalizeProductImageUrls(images, {
      ocrImageUrl: null,
    }),
    attributes,
  };
}

import { isBlockedTaxonomy } from "@/lib/catalog/policy";
import { isPlatformNutritionComplete } from "@/lib/nutrition/completeness";
import type { ProductNutrition } from "@/lib/supabase/types";
import { isZeptoVariantId } from "@/lib/zepto-import/variant-id";

export type CatalogEligibilityRow = {
  platform?: string | null;
  zepto_sku?: string | null;
  name: string;
  super_category?: string | null;
  category?: string | null;
  subcategory?: string | null;
  ingredients_raw?: string | null;
  nutrition?: ProductNutrition | null;
};

/** Rows eligible for public catalog (CSV import with real variant UUID). */
export function isCatalogSourceRow(p: {
  platform?: string | null;
  zepto_sku?: string | null;
}): boolean {
  return p.platform === "zepto" && isZeptoVariantId(p.zepto_sku);
}

/** Food SKUs with label-grade nutrition — excludes non-food and Zepto rows pending nutrition. */
export function isCatalogVisible(p: CatalogEligibilityRow): boolean {
  if (
    isBlockedTaxonomy({
      super_category: p.super_category,
      category: p.category,
      subcategory: p.subcategory,
      name: p.name,
    })
  ) {
    return false;
  }
  return isPlatformNutritionComplete(p.ingredients_raw ?? null, p.nutrition ?? null);
}

export function computeCatalogVisible(p: CatalogEligibilityRow): boolean {
  return isCatalogVisible(p) && isCatalogSourceRow(p);
}

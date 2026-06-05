import { productUsecase } from "@/lib/products/catalog-meta";
import type { ProductListItem } from "@/lib/products/queries";

const PLANT_PANEER_RE =
  /\btofu\b|\btempeh\b|\bsoya\b|\bsoy\b|\bsoyabean\b|\bsoybean\b/i;
const DAIRY_PANEER_L3 = /^paneer$/i;

export function isPlantPaneerSubstitute(
  p: Pick<ProductListItem, "name" | "l3_category" | "attributes">,
): boolean {
  const name = p.name ?? "";
  if (PLANT_PANEER_RE.test(name)) return true;
  const l3 = productUsecase(p) ?? "";
  if (/\btofu\b|\btempeh\b/i.test(l3)) return true;
  return false;
}

export function isDairyPaneerProduct(
  p: Pick<ProductListItem, "name" | "l3_category" | "attributes">,
): boolean {
  if (isPlantPaneerSubstitute(p)) return false;
  const l3 = productUsecase(p) ?? "";
  if (DAIRY_PANEER_L3.test(l3.trim())) return true;
  const name = p.name ?? "";
  return /\bpaneer\b/i.test(name) && !/\btofu\b/i.test(name);
}

/** Sort tier when user asked for paneer: dairy first, then plant substitutes, then other. */
export function paneerIntentSortTier(
  p: ProductListItem,
  productTerms: string[],
): number {
  if (!productTerms.some((t) => t.toLowerCase() === "paneer")) return 0;
  if (isDairyPaneerProduct(p)) return 3;
  if (isPlantPaneerSubstitute(p)) return 1;
  if (/\bpaneer\b/i.test(p.name ?? "")) return 2;
  return 0;
}

export function paneerRelevanceAdjust(
  p: ProductListItem,
  productTerms: string[],
  opts?: { preferPlant?: boolean; lowFatPreferred?: boolean },
): number {
  if (!productTerms.some((t) => t.toLowerCase() === "paneer")) return 0;
  if (opts?.preferPlant) return 0;
  let adj = 0;
  if (isDairyPaneerProduct(p)) adj += 160;
  else if (isPlantPaneerSubstitute(p)) adj -= 90;
  if (opts?.lowFatPreferred && isDairyPaneerProduct(p)) {
    const name = (p.name ?? "").toLowerCase();
    if (/low[\s-]?fat|high protein paneer|diet paneer|lite paneer/i.test(name)) adj += 50;
  }
  return adj;
}

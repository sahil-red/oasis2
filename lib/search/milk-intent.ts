import { productUsecase } from "@/lib/products/catalog-meta";
import type { ProductListItem } from "@/lib/products/queries";

const NOT_DAIRY_MILK_RE =
  /\bmilk bread\b|\bbread\b|\bbun\b|\bbiscuit\b|\bcookie\b|\bcracker\b|\brusk\b|\bcake\b|\bpastry\b|\bmuffin\b|\bsoap\b|\bface wash\b|\bmoistur/i;
const PROTEIN_MILK_RE =
  /\b(high protein|hi[\s-]?pro|pro[\s-]?milk|promilk|protein milk|protein rich|nourish\+|hilo|fortified.*protein)\b/i;

const DAIRY_MILK_L3 =
  /^(fresh cow milk|toned milk|full cream milk|tetra pack milk|milk|dairy milk|skim milk|cow milk|a2 milk)$/i;

export function isMilkAdjacentProduct(
  p: Pick<ProductListItem, "name" | "subcategory" | "l3_category" | "attributes">,
): boolean {
  const name = (p.name ?? "").toLowerCase();
  const l3 = (productUsecase(p) ?? "").toLowerCase();
  if (/\bmilk bread\b/i.test(l3) || /\bbread\b/i.test(l3)) return true;
  if (NOT_DAIRY_MILK_RE.test(name)) return true;
  const sub = (p.subcategory ?? "").toLowerCase();
  if (/\bbread\b|\bbiscuit\b|\bbakery\b/i.test(sub)) return true;
  return false;
}

export function isDairyMilkProduct(
  p: Pick<ProductListItem, "name" | "subcategory" | "l3_category" | "attributes">,
): boolean {
  if (isMilkAdjacentProduct(p)) return false;
  const l3 = productUsecase(p) ?? "";
  if (l3 && DAIRY_MILK_L3.test(l3.trim())) return true;
  const name = p.name ?? "";
  if (/\bmilk\b/i.test(name) && !NOT_DAIRY_MILK_RE.test(name.toLowerCase())) return true;
  return false;
}

export function isHighProteinMilkSignal(
  p: Pick<ProductListItem, "name" | "nutrition">,
): boolean {
  if (PROTEIN_MILK_RE.test(p.name ?? "")) return true;
  // Also flag products where actual nutrition data confirms high protein (≥8g/100g).
  // This catches genuine high-protein milks that don't say "high protein" in the name.
  const prot = (p as { nutrition?: { protein_g_100g?: number | null } }).nutrition?.protein_g_100g;
  return typeof prot === "number" && prot >= 8;
}

export function milkIntentSortTier(p: ProductListItem, productTerms: string[]): number {
  if (!productTerms.some((t) => t.toLowerCase() === "milk")) return 0;
  if (isDairyMilkProduct(p)) {
    return isHighProteinMilkSignal(p) ? 4 : 3;
  }
  if (isMilkAdjacentProduct(p)) return 1;
  return 0;
}

export function milkRelevanceAdjust(
  p: ProductListItem,
  productTerms: string[],
  sortIntent: string,
): number {
  if (!productTerms.some((t) => t.toLowerCase() === "milk")) return 0;
  if (isMilkAdjacentProduct(p)) return -120;
  if (!isDairyMilkProduct(p)) return 0;
  let adj = 0;
  if (isHighProteinMilkSignal(p)) adj += 55;
  if (sortIntent === "highest_protein") {
    const prot = p.nutrition?.protein_g_100g;
    if (prot != null && prot >= 5) adj += 25;
    else if (prot != null && prot >= 4) adj += 12;
  }
  return adj;
}

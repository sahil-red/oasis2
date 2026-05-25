import type { ProductListItem } from "@/lib/products/queries";

export type BrandStat = {
  brand: string;
  count: number;
  avgScore: number;
  avgSugar: number | null;
  avgProtein: number | null;
};

export type InsightLists = {
  cleanestBrands: BrandStat[];
  weakestBrands: BrandStat[];
  misleading: ProductListItem[];
  proteinPerRupee: ProductListItem[];
  highProteinSnacks: ProductListItem[];
};

const HEALTHY_MARKETING =
  /\b(healthy|protein|zero|diet|lite|light|natural|nutri|wellness|immunity|digestive)\b/i;

function sugar(p: ProductListItem): number | null {
  const n = p.nutrition;
  if (!n) return null;
  const s = n.sugar_g_100g ?? n.added_sugar_g_100g;
  return typeof s === "number" ? s : null;
}

export function buildInsights(products: ProductListItem[]): InsightLists {
  const scored = products.filter((p) => p.core_scores && p.brand);
  const byBrand = new Map<string, ProductListItem[]>();
  for (const p of scored) {
    const b = p.brand!;
    if (!byBrand.has(b)) byBrand.set(b, []);
    byBrand.get(b)!.push(p);
  }

  const brandStats: BrandStat[] = [...byBrand.entries()]
    .filter(([, list]) => list.length >= 3)
    .map(([brand, list]) => {
      const sugars = list.map(sugar).filter((s): s is number => s != null);
      const proteins = list
        .map((p) => p.nutrition?.protein_g_100g)
        .filter((x): x is number => typeof x === "number");
      return {
        brand,
        count: list.length,
        avgScore:
          list.reduce((s, p) => s + (p.core_scores?.score ?? 0), 0) / list.length,
        avgSugar: sugars.length ? sugars.reduce((a, b) => a + b, 0) / sugars.length : null,
        avgProtein: proteins.length
          ? proteins.reduce((a, b) => a + b, 0) / proteins.length
          : null,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);

  const misleading = products
    .filter((p) => {
      const score = p.core_scores?.score;
      if (score == null) return false;
      if (!HEALTHY_MARKETING.test(p.name)) return false;
      const s = sugar(p);
      return score < 45 || (s != null && s >= 12);
    })
    .sort((a, b) => (a.core_scores?.score ?? 100) - (b.core_scores?.score ?? 100))
    .slice(0, 12);

  const proteinPerRupee = products
    .filter((p) => {
      const protein = p.nutrition?.protein_g_100g;
      return (
        typeof protein === "number" &&
        protein >= 8 &&
        p.price_inr != null &&
        p.price_inr > 0
      );
    })
    .sort((a, b) => {
      const aPpr = (a.nutrition!.protein_g_100g! / a.price_inr!) * 100;
      const bPpr = (b.nutrition!.protein_g_100g! / b.price_inr!) * 100;
      return bPpr - aPpr;
    })
    .slice(0, 12);

  const highProteinSnacks = products
    .filter((p) => {
      const aisle = p.category ?? "";
      if (!/snack|munch|biscuit|bakery/i.test(aisle)) return false;
      return (p.nutrition?.protein_g_100g ?? 0) >= 12 && (p.core_scores?.score ?? 0) >= 50;
    })
    .sort(
      (a, b) =>
        (b.nutrition?.protein_g_100g ?? 0) - (a.nutrition?.protein_g_100g ?? 0),
    )
    .slice(0, 12);

  return {
    cleanestBrands: brandStats.slice(0, 8),
    weakestBrands: [...brandStats].reverse().slice(0, 8),
    misleading,
    proteinPerRupee,
    highProteinSnacks,
  };
}

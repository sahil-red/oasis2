import { proteinValueRankScore } from "@/lib/products/insight-copy";
import type { ProductListItem } from "@/lib/products/queries";

export type BrandStat = {
  brand: string;
  count: number;
  avgScore: number;
  avgSugar: number | null;
  avgProtein: number | null;
};

export type RankedProduct = {
  product: ProductListItem;
  rankScore: number;
};

export type InsightLists = {
  cleanestBrands: BrandStat[];
  weakestBrands: BrandStat[];
  misleading: RankedProduct[];
  proteinPerRupee: RankedProduct[];
  highProteinSnacks: RankedProduct[];
  featuredMisleading: ProductListItem | null;
};

const HEALTHY_MARKETING =
  /\b(healthy|protein|zero|diet|lite|light|natural|nutri|wellness|immunity|digestive|sugar free|no added sugar)\b/i;

function sugar(p: ProductListItem): number | null {
  const n = p.nutrition;
  if (!n) return null;
  const s = n.sugar_g_100g ?? n.added_sugar_g_100g;
  return typeof s === "number" ? s : null;
}

function rankProducts(
  products: ProductListItem[],
  scoreFn: (p: ProductListItem) => number,
  limit: number,
): RankedProduct[] {
  return products
    .map((product) => ({ product, rankScore: scoreFn(product) }))
    .filter((x) => x.rankScore > 0)
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, limit);
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

  const misleadingPool = products.filter((p) => {
    const score = p.core_scores?.score;
    if (score == null) return false;
    if (!HEALTHY_MARKETING.test(p.name)) return false;
    const s = sugar(p);
    return score < 50 || (s != null && s >= 10);
  });

  const misleading = rankProducts(
    misleadingPool,
    (p) => {
      const score = p.core_scores?.score ?? 100;
      const s = sugar(p) ?? 0;
      return 100 - score + s * 2 + (HEALTHY_MARKETING.test(p.name) ? 10 : 0);
    },
    16,
  );

  const proteinPool = products.filter((p) => {
    const protein = p.nutrition?.protein_g_100g;
    const core = p.core_scores?.score ?? 0;
    return (
      typeof protein === "number" &&
      protein >= 10 &&
      p.price_inr != null &&
      p.price_inr > 0 &&
      core >= 45
    );
  });

  const proteinPerRupee = rankProducts(proteinPool, proteinValueRankScore, 16);

  const snackPool = products.filter((p) => {
    const aisle = p.category ?? "";
    if (!/snack|munch|biscuit|bakery/i.test(aisle)) return false;
    return (p.nutrition?.protein_g_100g ?? 0) >= 12 && (p.core_scores?.score ?? 0) >= 50;
  });

  const highProteinSnacks = rankProducts(
    snackPool,
    (p) => (p.nutrition?.protein_g_100g ?? 0) * 2 + (p.core_scores?.score ?? 0) * 0.3,
    12,
  );

  return {
    cleanestBrands: brandStats.slice(0, 8),
    weakestBrands: [...brandStats].reverse().slice(0, 8),
    misleading,
    proteinPerRupee,
    highProteinSnacks,
    featuredMisleading: misleading[0]?.product ?? null,
  };
}

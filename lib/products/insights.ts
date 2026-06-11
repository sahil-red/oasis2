import { isChipStyleSnack, proteinValueRankScore } from "@/lib/products/insight-copy";
import type { ProductListItem } from "@/lib/products/queries";
import type { SublabelId } from "@/lib/scoring/sublabels";

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
  meta?: string;
};

export type CategoryStat = {
  category: string;
  avgScore: number;
  count: number;
  dailyStapleCount: number;
  skipCount: number;
};

export type SublabelFreq = {
  id: string;
  label: string;
  count: number;
  pct: number;
};

export type InsightLists = {
  cleanestBrands: BrandStat[];
  weakestBrands: BrandStat[];
  misleading: RankedProduct[];
  proteinPerRupee: RankedProduct[];
  highProteinSnacks: RankedProduct[];
  featuredMisleading: ProductListItem | null;
  // V9 additions
  dailyStaples: RankedProduct[];
  skipWorthy: RankedProduct[];
  fiberLeaders: RankedProduct[];
  lowCalorieFills: RankedProduct[];
  categoryStats: CategoryStat[];
  topSublabels: SublabelFreq[];
  bottomSublabels: SublabelFreq[];
  gymPicks: RankedProduct[];
  gutHealthPicks: RankedProduct[];
  kidFriendly: RankedProduct[];
  ultraProcessedWorst: RankedProduct[];
  bestInCohort: RankedProduct[];
  totalScored: number;
  dailyStapleCount: number;
  skipCount: number;
  avgScore: number;
};

const HEALTHY_MARKETING =
  /\b(healthy|protein|zero|diet|lite|light|natural|nutri|wellness|immunity|digestive|sugar free|no added sugar)\b/i;

/** Sublabels that contradict health marketing — a product flagged with these
 *  while making a health claim is genuinely misleading. */
const CONTRADICTING_SUBLABELS = new Set<SublabelId>([
  "hidden_sweetener",
  "high_in_sugar",
  "very_high_in_sugar",
  "ultra_processed",
  "mostly_nova_4",
  "artificial_flavors",
  "high_saturated_fat",
  "excessive_sodium",
  "hazardous_additive",
  "label_mismatch",
  "trans_fat_present",
  "refined_carbs_inside",
  "calorie_dense",
  "empty_calories",
]);

function sugar(p: ProductListItem): number | null {
  const n = p.nutrition;
  if (!n) return null;
  const s = n.sugar_g_100g ?? n.added_sugar_g_100g;
  return typeof s === "number" ? s : null;
}

function marketingText(p: ProductListItem): string {
  return [p.name, p.attributes?.["Key Features"] ?? "", p.attributes?.Description ?? ""]
    .join(" ")
    .toLowerCase();
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

function hasSublabel(p: ProductListItem, id: SublabelId): boolean {
  return Boolean((p.core_scores?.verdict_sublabels as string[] | undefined)?.includes(id));
}

export function buildInsights(products: ProductListItem[]): InsightLists {
  const scored = products.filter((p) => p.core_scores);
  const totalScored = scored.length;
  const avgScore = totalScored
    ? scored.reduce((s, p) => s + (p.core_scores?.score ?? 0), 0) / totalScored
    : 0;

  // ── Brand stats ──
  const scoredWithBrand = scored.filter((p) => p.brand);
  const byBrand = new Map<string, ProductListItem[]>();
  for (const p of scoredWithBrand) {
    const b = p.brand!;
    if (!byBrand.has(b)) byBrand.set(b, []);
    byBrand.get(b)!.push(p);
  }
  const brandStats: BrandStat[] = [...byBrand.entries()]
    .filter(([, list]) => list.length >= 3)
    .map(([brand, list]) => {
      const sugars = list.map(sugar).filter((s): s is number => s != null);
      const proteins = list.map((p) => p.nutrition?.protein_g_100g).filter((x): x is number => typeof x === "number");
      return {
        brand,
        count: list.length,
        avgScore: list.reduce((s, p) => s + (p.core_scores?.score ?? 0), 0) / list.length,
        avgSugar: sugars.length ? sugars.reduce((a, b) => a + b, 0) / sugars.length : null,
        avgProtein: proteins.length ? proteins.reduce((a, b) => a + b, 0) / proteins.length : null,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);

  // ── Misleading ──
  // Products making health claims whose nutrition/ingredients tell a different story.
  // Uses sublabels + name claims instead of naive "high sugar = misleading" logic.
  const misleadingPool = products.filter((p) => {
    const score = p.core_scores?.score;
    if (score == null) return false;
    const sublabels = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];
    const marketing = marketingText(p);
    const hasClaim = HEALTHY_MARKETING.test(marketing);

    // A product is misleading when it makes a health claim but has contradicting sublabels.
    if (hasClaim && sublabels.some((s) => CONTRADICTING_SUBLABELS.has(s as SublabelId))) {
      return true;
    }

    // Products marketed to kids but flagged high_in_sugar or ultra_processed.
    const kidsCategories = /snack|dairy|bread|cereal|biscuit|chocolate|fruit|milk/i;
    if (kidsCategories.test(p.category ?? "") && (
      sublabels.includes("high_in_sugar") || sublabels.includes("very_high_in_sugar") || sublabels.includes("ultra_processed")
    )) {
      return true;
    }

    // Strong health claim but score is terrible — marketing runs far ahead of reality.
    if (hasClaim && score < 35) return true;

    return false;
  });
  const misleading = rankProducts(
    misleadingPool,
    (p) => {
      const score = p.core_scores?.score ?? 100;
      const s = sugar(p);
      const sublabels = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];
      const contradictions = sublabels.filter((sl) => CONTRADICTING_SUBLABELS.has(sl as SublabelId)).length;
      return (100 - score) + (contradictions * 15) + (s != null ? Math.min(s, 20) : 0) * 2;
    },
    24,
  );

  // ── Protein value ──
  const proteinPerRupee = rankProducts(
    products.filter((p) => {
      const protein = p.nutrition?.protein_g_100g;
      return typeof protein === "number" && protein >= 6 && p.price_inr != null && p.price_inr > 0 && !isChipStyleSnack(p);
    }),
    proteinValueRankScore,
    16,
  );

  // ── High-protein snacks ──
  const highProteinSnacks = rankProducts(
    products.filter((p) => /snack|munch|biscuit|bakery/i.test(p.category ?? "") && (p.nutrition?.protein_g_100g ?? 0) >= 12 && (p.core_scores?.score ?? 0) >= 50),
    (p) => (p.nutrition?.protein_g_100g ?? 0) * 2 + (p.core_scores?.score ?? 0) * 0.3,
    12,
  );

  // ── Daily staples leaderboard ──
  const dailyStapleCount = scored.filter((p) => p.core_scores?.verdict === "daily_staple").length;
  const skipCount = scored.filter((p) => p.core_scores?.verdict === "skip").length;

  const dailyStaples = rankProducts(
    scored.filter((p) => p.core_scores?.verdict === "daily_staple"),
    (p) => p.core_scores?.score ?? 0,
    16,
  );

  // ── Skip-worthy ──
  const skipWorthy = rankProducts(
    scored.filter((p) => p.core_scores?.verdict === "skip"),
    (p) => 100 - (p.core_scores?.score ?? 100),
    16,
  );

  // ── Gym picks (high protein, low NOVA) ──
  const gymPicks = rankProducts(
    scored.filter((p) => hasSublabel(p, "good_for_gym_goers") || hasSublabel(p, "high_in_protein")),
    (p) => (p.nutrition?.protein_g_100g ?? 0) + (p.core_scores?.score ?? 0) * 0.5,
    12,
  );

  // ── Gut health ──
  const gutHealthPicks = rankProducts(
    scored.filter((p) => hasSublabel(p, "good_for_gut") || hasSublabel(p, "naturally_fermented")),
    (p) => p.core_scores?.score ?? 0,
    12,
  );

  // ── Fiber leaders ──
  const fiberLeaders = rankProducts(
    scored.filter((p) => hasSublabel(p, "rich_in_fiber")),
    (p) => (p.nutrition?.fiber_g_100g ?? 0) + (p.core_scores?.score ?? 0) * 0.3,
    12,
  );

  // ── Low-calorie filling ──
  const lowCalorieFills = rankProducts(
    scored.filter((p) => hasSublabel(p, "good_for_weight_loss")),
    (p) => p.core_scores?.score ?? 0,
    12,
  );

  // ── Kid-friendly (no artificial flavors, no skip, snack/staple) ──
  const kidFriendly = rankProducts(
    scored.filter(
      (p) =>
        !hasSublabel(p, "artificial_flavors") &&
        !hasSublabel(p, "hidden_sweetener") &&
        p.core_scores?.verdict !== "skip" &&
        /snack|dairy|bread|cereal|biscuit|chocolate|fruit|milk/i.test(p.category ?? ""),
    ),
    (p) => p.core_scores?.score ?? 0,
    12,
  );

  // ── Ultra-processed worst offenders ──
  const ultraProcessedWorst = rankProducts(
    scored.filter((p) => hasSublabel(p, "ultra_processed") || hasSublabel(p, "mostly_nova_4")),
    (p) => 100 - (p.core_scores?.score ?? 100),
    12,
  );

  // ── Best in cohort (relative ≥ 80 even if absolute < 65) ──
  const bestInCohort = rankProducts(
    scored.filter((p) => hasSublabel(p, "best_in_category")),
    (p) => p.core_scores?.relative_score ?? 0,
    12,
  );

  // ── Category stats ──
  const byCategory = new Map<string, ProductListItem[]>();
  for (const p of scored) {
    const cat = p.category ?? "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }
  const categoryStats: CategoryStat[] = [...byCategory.entries()]
    .filter(([, list]) => list.length >= 10)
    .map(([category, list]) => ({
      category,
      count: list.length,
      avgScore: list.reduce((s, p) => s + (p.core_scores?.score ?? 0), 0) / list.length,
      dailyStapleCount: list.filter((p) => p.core_scores?.verdict === "daily_staple").length,
      skipCount: list.filter((p) => p.core_scores?.verdict === "skip").length,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // ── Sublabel frequency ──
  const sublabelCounts = new Map<string, number>();
  for (const p of scored) {
    const labels = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];
    for (const l of labels) sublabelCounts.set(l, (sublabelCounts.get(l) ?? 0) + 1);
  }
  const sublabelsSorted = [...sublabelCounts.entries()]
    .map(([id, count]) => ({ id, label: id.replace(/_/g, " "), count, pct: Math.round((count / totalScored) * 100) }))
    .sort((a, b) => b.count - a.count);

  const POSITIVE_IDS = new Set(["clean_protein", "rich_in_fiber", "good_for_gut", "heart_friendly", "whole_food", "naturally_fermented", "high_in_protein", "low_sodium", "good_for_weight_loss", "good_for_gym_goers", "healthy_snacking", "clean_carbs", "low_glycemic", "bone_support", "good_for_bulking", "energy_dense", "fortified_well", "immune_boost", "mindful_portions"]);
  const topSublabels = sublabelsSorted.filter((s) => POSITIVE_IDS.has(s.id)).slice(0, 8);
  const bottomSublabels = sublabelsSorted.filter((s) => !POSITIVE_IDS.has(s.id)).slice(0, 8);

  return {
    cleanestBrands: brandStats.slice(0, 8),
    weakestBrands: [...brandStats].reverse().slice(0, 8),
    misleading,
    proteinPerRupee,
    highProteinSnacks,
    featuredMisleading: misleading[0]?.product ?? null,
    dailyStaples,
    skipWorthy,
    fiberLeaders,
    lowCalorieFills,
    categoryStats,
    topSublabels,
    bottomSublabels,
    gymPicks,
    gutHealthPicks,
    kidFriendly,
    ultraProcessedWorst,
    bestInCohort,
    totalScored,
    dailyStapleCount,
    skipCount,
    avgScore: Math.round(avgScore),
  };
}

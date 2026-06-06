import type { CategoryTraitProfileRow, ProductSearchIndexRow, TraitId, TraitVector } from "@/lib/search/v2/types";
import { TRAIT_IDS } from "@/lib/search/v2/types";

function categoryKey(category: string | null, subcategory: string | null): string {
  const c = (category ?? "").trim().toLowerCase();
  const s = (subcategory ?? "").trim().toLowerCase();
  if (c && s) return `${c}::${s}`;
  return c || s || "unknown";
}

function meanTraits(rows: ProductSearchIndexRow[]): TraitVector {
  const sums: Partial<Record<TraitId, number>> = {};
  const counts: Partial<Record<TraitId, number>> = {};
  for (const row of rows) {
    for (const trait of TRAIT_IDS) {
      const v = row.traits[trait];
      if (v == null || !Number.isFinite(v)) continue;
      sums[trait] = (sums[trait] ?? 0) + v;
      counts[trait] = (counts[trait] ?? 0) + 1;
    }
  }
  const out: TraitVector = {};
  for (const trait of TRAIT_IDS) {
    const c = counts[trait];
    if (c && c > 0) out[trait] = (sums[trait] ?? 0) / c;
  }
  return out;
}

export function buildCategoryTraitProfiles(index: ProductSearchIndexRow[]): CategoryTraitProfileRow[] {
  const groups = new Map<string, ProductSearchIndexRow[]>();
  for (const row of index) {
    const key = categoryKey(row.category, row.subcategory);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([category_key, rows]) => ({
    category_key,
    category: rows[0]?.category ?? null,
    subcategory: rows[0]?.subcategory ?? null,
    trait_means: meanTraits(rows),
    product_count: rows.length,
  }));
}

/** Weighted dot product between goal weights and category trait means. */
export function categoryGoalOverlap(
  profile: CategoryTraitProfileRow,
  goalWeights: TraitVector,
): number {
  let sumW = 0;
  let sum = 0;
  for (const [trait, weight] of Object.entries(goalWeights)) {
    if (!weight || weight <= 0) continue;
    const mean = profile.trait_means[trait as TraitId];
    if (mean == null) continue;
    sumW += weight;
    sum += weight * mean;
  }
  return sumW > 0 ? sum / sumW : 0;
}

export function selectCategoriesForGoal(
  profiles: CategoryTraitProfileRow[],
  goalWeights: TraitVector,
  topK = 8,
): CategoryTraitProfileRow[] {
  return [...profiles]
    .map((p) => ({ profile: p, overlap: categoryGoalOverlap(p, goalWeights) }))
    .filter((x) => x.overlap > 0.15 && x.profile.product_count >= 3)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, topK)
    .map((x) => x.profile);
}

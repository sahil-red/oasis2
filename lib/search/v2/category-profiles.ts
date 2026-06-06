import { cosineSimilarity, embedText } from "@/lib/search/v2/embeddings";
import type { CategoryTraitProfileRow, ProductSearchIndexRow, TraitId, TraitVector } from "@/lib/search/v2/types";
import { TRAIT_IDS, CATEGORY_CENTROID_THRESHOLD, CATEGORY_CENTROID_TOP_K } from "@/lib/search/v2/types";

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

function traitVectorToText(weights: TraitVector): string {
  return Object.entries(weights)
    .filter(([, v]) => v != null && v > 0)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, v]) => `${k}:${(v ?? 0).toFixed(2)}`)
    .join(" ");
}

export async function buildCategoryTraitProfiles(
  index: ProductSearchIndexRow[],
): Promise<CategoryTraitProfileRow[]> {
  const groups = new Map<string, ProductSearchIndexRow[]>();
  for (const row of index) {
    const key = categoryKey(row.category, row.subcategory);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const profiles: CategoryTraitProfileRow[] = [];
  for (const [category_key, rows] of groups) {
    const trait_means = meanTraits(rows);
    const centroidText = traitVectorToText(trait_means);
    const centroidVec = centroidText ? await embedText(centroidText) : [];
    profiles.push({
      category_key,
      category: rows[0]?.category ?? null,
      subcategory: rows[0]?.subcategory ?? null,
      trait_means,
      trait_centroid: centroidVec.length ? centroidVec : null,
      product_count: rows.length,
    });
  }
  return profiles;
}

/** §6a goal candidate gen — cosine(goal_weights, category_trait_centroid) ≥ 0.5, top-K=8 */
export async function selectCategoriesForGoal(
  profiles: CategoryTraitProfileRow[],
  goalWeights: TraitVector,
): Promise<CategoryTraitProfileRow[]> {
  const goalText = traitVectorToText(goalWeights);
  const goalEmbed = goalText ? await embedText(goalText) : [];
  if (!goalEmbed.length) return profiles.slice(0, CATEGORY_CENTROID_TOP_K);

  return [...profiles]
    .map((p) => ({
      profile: p,
      overlap: p.trait_centroid?.length
        ? cosineSimilarity(goalEmbed, p.trait_centroid)
        : 0,
    }))
    .filter((x) => x.overlap >= CATEGORY_CENTROID_THRESHOLD && x.profile.product_count >= 3)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, CATEGORY_CENTROID_TOP_K)
    .map((x) => x.profile);
}

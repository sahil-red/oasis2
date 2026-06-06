/**
 * §8 Canonical clustering — base_name + brand embedding proximity (not regex).
 */
import { cosineSimilarity, embedTextBatch } from "@/lib/search/v2/embeddings";
import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

export const CANONICAL_CLUSTER_THRESHOLD = 0.92;

type BrandCluster = {
  repIdx: number;
  centroid: number[];
};

function clusterKeyText(row: ProductSearchIndexRow): string {
  const brand = (row.brand ?? "").trim().toLowerCase();
  const base = (row.base_name ?? row.name).trim().toLowerCase();
  return `${brand} ${base}`.trim();
}

/** Assign canonical_product_id via greedy embedding clustering within brand. */
export async function assignCanonicalClusters(
  rows: ProductSearchIndexRow[],
): Promise<ProductSearchIndexRow[]> {
  if (!rows.length) return rows;

  const embeddings = await embedTextBatch(rows.map(clusterKeyText), 64);
  const canonicalByIdx = rows.map((r) => r.product_id);

  const byBrand = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const brand = (rows[i]!.brand ?? "").trim().toLowerCase() || "__unknown__";
    const list = byBrand.get(brand) ?? [];
    list.push(i);
    byBrand.set(brand, list);
  }

  for (const [, indices] of byBrand) {
    const clusters: BrandCluster[] = [];

    for (const idx of indices) {
      const embed = embeddings[idx] ?? [];
      if (!embed.length) continue;

      let bestCi = -1;
      let bestSim = 0;
      for (let ci = 0; ci < clusters.length; ci++) {
        const sim = cosineSimilarity(embed, clusters[ci]!.centroid);
        if (sim >= CANONICAL_CLUSTER_THRESHOLD && sim > bestSim) {
          bestCi = ci;
          bestSim = sim;
        }
      }

      if (bestCi >= 0) {
        const cluster = clusters[bestCi]!;
        const repIdx = cluster.repIdx;
        if (rows[idx]!.data_quality_score > rows[repIdx]!.data_quality_score) {
          cluster.repIdx = idx;
        }
      } else {
        clusters.push({ repIdx: idx, centroid: embed });
      }
    }

    for (const idx of indices) {
      const embed = embeddings[idx] ?? [];
      if (!embed.length) continue;
      for (const cluster of clusters) {
        if (cosineSimilarity(embed, cluster.centroid) >= CANONICAL_CLUSTER_THRESHOLD) {
          canonicalByIdx[idx] = rows[cluster.repIdx]!.product_id;
          break;
        }
      }
    }
  }

  return rows.map((row, i) => ({
    ...row,
    canonical_product_id: canonicalByIdx[i] ?? row.product_id,
  }));
}

/** Count siblings sharing a canonical id (for expand UI). */
export function countCanonicalSiblings(
  index: ProductSearchIndexRow[],
  canonicalId: string | null,
): number {
  if (!canonicalId) return 1;
  return index.filter((r) => (r.canonical_product_id ?? r.product_id) === canonicalId).length;
}

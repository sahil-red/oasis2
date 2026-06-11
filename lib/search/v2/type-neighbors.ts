/**
 * §11 relaxation hints — nearest distinct product types, learned from the
 * catalog itself (type-centroid distances). No hardcoded neighbor lists, no
 * category sampling heuristics: "smoothie" → milkshake/yogurt drink because
 * their products' embeddings say so.
 */
import { nearestTypesFromCentroids } from "@/lib/search/v2/type-centroids";

export async function nearestPrimaryTypes(
  primaryType: string,
  limit = 5,
): Promise<string[]> {
  const wanted = primaryType.trim().toLowerCase();
  if (!wanted) return [];
  return nearestTypesFromCentroids(wanted, limit);
}

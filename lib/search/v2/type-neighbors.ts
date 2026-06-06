/**
 * §11 relaxation hints — embedding-nearest primary_types from the enriched index (not a hierarchy table).
 */
import { cosineSimilarity, embedText } from "@/lib/search/v2/embeddings";
import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

export async function nearestPrimaryTypes(
  primaryType: string,
  index: ProductSearchIndexRow[],
  limit = 5,
): Promise<string[]> {
  const wanted = primaryType.trim().toLowerCase();
  if (!wanted) return [];

  const queryEmbed = await embedText(wanted);
  const byType = new Map<string, number[]>();

  for (const row of index) {
    const t = row.primary_type?.toLowerCase();
    if (!t || t === wanted) continue;
    const embed = row.type_embedding;
    if (!embed?.length) continue;
    if (!byType.has(t)) byType.set(t, embed);
  }

  const scored: Array<{ type: string; sim: number }> = [];
  for (const [type, embed] of byType) {
    const sim = queryEmbed.length ? cosineSimilarity(queryEmbed, embed) : 0;
    scored.push({ type, sim });
  }

  return scored
    .sort((a, b) => b.sim - a.sim)
    .slice(0, limit)
    .filter((x) => x.sim >= 0.7)
    .map((x) => x.type);
}

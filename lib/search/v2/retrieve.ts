/**
 * §7a Hybrid retrieve / rerank (~500 → ~50) — RRF(structured, vector), k=60.
 */
import { cosineSimilarity, embedText } from "@/lib/search/v2/embeddings";
import { fetchLexicalScoresFromDb } from "@/lib/search/v2/db-lexical";
import { reciprocalRankFusion } from "@/lib/search/v2/rrf";
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";

export const RERANK_CAP = 50;

function lexicalScore(row: ProductSearchIndexRow, query: string): number {
  const q = query.toLowerCase();
  const doc = row.search_doc ?? "";
  if (!doc) return 0;
  let score = 0;
  for (const token of q.split(/\s+/).filter((t) => t.length >= 3)) {
    if (doc.includes(token)) score += 1;
  }
  if (row.brand?.toLowerCase() && q.includes(row.brand.toLowerCase())) score += 3;
  return score;
}

export async function retrieveAndRerank(
  candidates: ProductSearchIndexRow[],
  intent: SearchIntentV2,
  opts: { useDbLexical?: boolean } = {},
): Promise<{ rows: ProductSearchIndexRow[]; relevanceById: Map<string, number> }> {
  const dbLexical =
    opts.useDbLexical && candidates.length
      ? await fetchLexicalScoresFromDb(
          candidates.map((c) => c.product_id),
          intent.raw_query,
        )
      : new Map<string, number>();

  const structured = [...candidates]
    .map((row) => ({
      row,
      score: dbLexical.get(row.product_id) ?? lexicalScore(row, intent.raw_query),
    }))
    .sort((a, b) => b.score - a.score);

  const structuredRanks = structured.map((x, i) => ({
    id: x.row.product_id,
    rank: i + 1,
  }));

  const queryEmbed = await embedText(intent.raw_query, "query");
  const vectorRanks = [...candidates]
    .map((row) => ({
      row,
      sim: queryEmbed.length && row.embedding?.length ? cosineSimilarity(queryEmbed, row.embedding) : 0,
    }))
    .sort((a, b) => b.sim - a.sim)
    .map((x, i) => ({ id: x.row.product_id, rank: i + 1 }));

  const lists = queryEmbed.length ? [structuredRanks, vectorRanks] : [structuredRanks];

  const fused = reciprocalRankFusion(lists);

  const rows = [...candidates]
    .sort((a, b) => (fused.get(b.product_id) ?? 0) - (fused.get(a.product_id) ?? 0))
    .slice(0, RERANK_CAP);

  const max = Math.max(...[...fused.values()], 1e-9);
  const relevanceById = new Map<string, number>();
  for (const [id, score] of fused) relevanceById.set(id, score / max);

  return { rows, relevanceById };
}

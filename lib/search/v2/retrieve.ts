/**
 * §7a Retrieve / rerank (~500 → ~50) — structured-first + RRF.
 * Vector expansion is parked (§16.5); RRF fuse hook is in place for pgvector later.
 */
import type { ProductSearchIndexRow, SearchIntentV2 } from "@/lib/search/v2/types";

export const RERANK_CAP = 50;
const RRF_K = 60;

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

function reciprocalRankFusion(lists: Array<Array<{ id: string; rank: number }>>): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const { id, rank } of list) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));
    }
  }
  return scores;
}

/**
 * Structured lexical rerank within membership set. Vector list omitted until §16.5.
 * Vector can only reorder within candidates — never add off-filter products (§7a).
 */
export function retrieveAndRerank(
  candidates: ProductSearchIndexRow[],
  intent: SearchIntentV2,
): ProductSearchIndexRow[] {
  const structured = [...candidates]
    .map((row) => ({ row, score: lexicalScore(row, intent.raw_query) }))
    .sort((a, b) => b.score - a.score);

  const structuredRanks = structured.map((x, i) => ({
    id: x.row.product_id,
    rank: i + 1,
  }));

  // §16.5 embeddings parked — single-list RRF equals structured order today
  const fused = reciprocalRankFusion([structuredRanks]);

  return [...candidates]
    .sort((a, b) => (fused.get(b.product_id) ?? 0) - (fused.get(a.product_id) ?? 0))
    .slice(0, RERANK_CAP);
}

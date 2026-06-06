/** Reciprocal rank fusion — shared by candidate cap (§6) and retrieve rerank (§7a). */
export const RRF_K = 60;

export function reciprocalRankFusion(
  lists: Array<Array<{ id: string; rank: number }>>,
): Map<string, number> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const { id, rank } of list) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + rank));
    }
  }
  return scores;
}

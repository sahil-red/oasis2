/**
 * §7a Postgres trigram lexical scores over candidate IDs.
 */
import { adminClient } from "@/lib/supabase/admin";

export async function fetchLexicalScoresFromDb(
  productIds: string[],
  query: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!productIds.length || !query.trim()) return out;

  try {
    const supabase = adminClient();
    const { data, error } = await supabase.rpc("search_v2_lexical_scores", {
      p_query: query.trim(),
      p_product_ids: productIds,
    });
    if (error || !data) return out;
    for (const row of data as Array<{ product_id: string; score: number }>) {
      out.set(String(row.product_id), Number(row.score ?? 0));
    }
  } catch {
    // RPC may be unavailable before migration
  }
  return out;
}

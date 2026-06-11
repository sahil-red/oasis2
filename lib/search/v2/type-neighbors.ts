/**
 * §11 relaxation hints — primary_type neighbors from the DB (faceted search).
 */
import { adminClient } from "@/lib/supabase/admin";

export async function nearestPrimaryTypes(
  primaryType: string,
  _index: unknown, // unused, kept for backward compat
  limit = 5,
): Promise<string[]> {
  const wanted = primaryType.trim().toLowerCase();
  if (!wanted) return [];

  try {
    const supabase = adminClient();
    // Get popular primary_types from the same category as the wanted type
    const { data: row } = await supabase
      .from("product_search_index")
      .select("category, subcategory")
      .eq("primary_type", wanted)
      .limit(1);

    if (!row?.length) return [];

    const { cat, sub } = row[0] as { category?: string; subcategory?: string };
    const { data: neighbors } = await supabase
      .from("product_search_index")
      .select("primary_type")
      .eq("category", cat ?? "")
      .neq("primary_type", wanted)
      .not("primary_type", "is", null)
      .limit(limit * 2);

    if (!neighbors?.length) return [];

    const seen = new Set<string>();
    const result: string[] = [];
    for (const n of neighbors) {
      const t = (n as { primary_type?: string }).primary_type?.toLowerCase();
      if (t && !seen.has(t)) { seen.add(t); result.push(t); }
    }
    return result.slice(0, limit);
  } catch {
    return [];
  }
}

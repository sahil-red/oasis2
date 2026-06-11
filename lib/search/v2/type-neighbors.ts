/**
 * §11 relaxation hints — primary_type neighbors from the DB (faceted search).
 */
import { adminClient } from "@/lib/supabase/admin";

export async function nearestPrimaryTypes(
  primaryType: string,
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

    const r = row[0] as { category?: string; subcategory?: string };
    const { category, subcategory } = r;
    // Prefer the tighter subcategory neighborhood; sample wide (rows share types,
    // so a small limit collapses to 1-2 distinct values). Single tiny column.
    let query = supabase
      .from("product_search_index")
      .select("primary_type")
      .neq("primary_type", wanted)
      .not("primary_type", "is", null)
      .limit(100);
    query = subcategory
      ? query.eq("subcategory", subcategory)
      : query.eq("category", category ?? "");
    const { data: neighbors } = await query;

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

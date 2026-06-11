/**
 * §14 comparison queries — resolve reference product from DB.
 */
import { adminClient } from "@/lib/supabase/admin";
import { mapDbRow } from "@/lib/search/v2/index-queries";
import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

export type ComparisonContext = {
  reference_product_id: string;
  reference_name: string;
  reference_scout_score: number;
  reference_price_inr: number | null;
  mode: "healthier_than" | "cheaper_than";
};

/** Resolve the reference SKU from the DB via name/brand search. */
export async function resolveComparisonReference(
  refPhrase: string,
): Promise<ComparisonContext | null> {
  const phrase = refPhrase.trim().toLowerCase();
  if (!phrase) return null;

  const supabase = adminClient();
  const { data } = await supabase
    .from("product_search_index")
    .select("*")
    .or(`name.ilike.%${phrase}%,brand.ilike.%${phrase}%`)
    .gte("data_quality_score", 0.3)
    .limit(10);

  if (!data?.length) return null;

  const rows = (data as Record<string, unknown>[]).map(mapDbRow);
  const exact = rows.find(r => r.name.toLowerCase().includes(phrase));
  const best = exact ?? rows[0]!;

  return {
    reference_product_id: best.product_id,
    reference_name: best.name,
    reference_scout_score: best.scout_score ?? 50,
    reference_price_inr: best.price_inr,
    mode: "healthier_than",
  };
}

export function comparisonBeatScore(
  row: ProductSearchIndexRow,
  ctx: ComparisonContext,
): number {
  if (ctx.mode === "healthier_than") {
    const score = row.scout_score ?? 0;
    if (score <= ctx.reference_scout_score) return 0;
    return clamp01((score - ctx.reference_scout_score) / Math.max(20, 100 - ctx.reference_scout_score));
  }
  if (ctx.mode === "cheaper_than") {
    const price = row.price_inr;
    const ref = ctx.reference_price_inr;
    if (price == null || ref == null || price >= ref) return 0;
    return clamp01((ref - price) / ref);
  }
  return 0;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * §14 comparison queries — resolve reference product from DB.
 */
import { adminClient } from "@/lib/supabase/admin";
import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

export type ComparisonContext = {
  reference_product_id: string;
  reference_name: string;
  reference_scout_score: number;
  reference_price_inr: number | null;
  mode: "healthier_than" | "cheaper_than";
};

type RefRow = { product_id: string; name: string; scout_score?: number; price_inr?: number };

export async function resolveComparisonReference(
  refPhrase: string,
): Promise<ComparisonContext | null> {
  const phrase = refPhrase.trim().toLowerCase();
  if (!phrase) return null;

  const supabase = adminClient();

  // Chain ilike — avoids PostgREST filter injection from commas/parens in LLM-extracted names
  const { data } = await supabase
    .from("product_search_index")
    .select("product_id, name, scout_score, price_inr")
    .ilike("name", `%${phrase}%`)
    .gte("data_quality_score", 0.3)
    .limit(10);

  const pick = (rows: RefRow[] | null): ComparisonContext | null => {
    if (!rows?.length) return null;
    const r = rows[0]!;
    return {
      reference_product_id: r.product_id,
      reference_name: r.name,
      reference_scout_score: r.scout_score ?? 50,
      reference_price_inr: r.price_inr ?? null,
      mode: "healthier_than",
    };
  };

  if (data?.length) return pick(data as RefRow[]);

  // Fallback: brand match
  const { data: brandData } = await supabase
    .from("product_search_index")
    .select("product_id, name, scout_score, price_inr")
    .ilike("brand", `%${phrase}%`)
    .gte("data_quality_score", 0.3)
    .limit(10);

  return pick(brandData as RefRow[]);
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

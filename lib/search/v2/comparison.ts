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

  // Tokenize → "%maggi%masala%" matches "Maggi 2-Minute, Masala Noodles" despite
  // punctuation the user never typed. Alnum-only tokens also keep the value safe
  // for PostgREST filter syntax (no commas/parens can reach it).
  const tokens = phrase.split(/[^a-z0-9]+/i).filter((t) => t.length >= 2);
  if (!tokens.length) return null;
  const pattern = `%${tokens.join("%")}%`;

  const pick = (rows: RefRow[] | null): ComparisonContext | null => {
    if (!rows?.length) return null;
    // Shortest matching name ≈ the canonical SKU ("Maggi Masala Noodles" beats
    // "Maggi Masala Noodles Saver Pack of 12"); rows arrive quality-sorted.
    const best = [...rows].sort((a, b) => a.name.length - b.name.length)[0]!;
    return {
      reference_product_id: best.product_id,
      reference_name: best.name,
      reference_scout_score: best.scout_score ?? 50,
      reference_price_inr: best.price_inr ?? null,
      mode: "healthier_than",
    };
  };

  const { data } = await supabase
    .from("product_search_index")
    .select("product_id, name, scout_score, price_inr")
    .ilike("name", pattern)
    .gte("data_quality_score", 0.3)
    .order("data_quality_score", { ascending: false })
    .limit(10);

  if (data?.length) return pick(data as RefRow[]);

  // Fallback: brand match
  const { data: brandData } = await supabase
    .from("product_search_index")
    .select("product_id, name, scout_score, price_inr")
    .ilike("brand", pattern)
    .gte("data_quality_score", 0.3)
    .order("data_quality_score", { ascending: false })
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

/**
 * §14 comparison queries — resolve reference product, rank relative to it.
 */
import { cosineSimilarity, embedText } from "@/lib/search/v2/embeddings";
import { lexicalBlob } from "@/lib/search/v2/lexical-fallback";
import type { ProductSearchIndexRow } from "@/lib/search/v2/types";

export type ComparisonContext = {
  reference_product_id: string;
  reference_name: string;
  reference_scout_score: number;
  reference_price_inr: number | null;
  mode: "healthier_than" | "cheaper_than";
};

/** Resolve the reference SKU from the index via embedding + lexical match (no synonym table). */
export async function resolveComparisonReference(
  refPhrase: string,
  index: ProductSearchIndexRow[],
): Promise<ComparisonContext | null> {
  const phrase = refPhrase.trim().toLowerCase();
  if (!phrase) return null;

  const refEmbed = await embedText(phrase);
  let best: ProductSearchIndexRow | null = null;
  let bestScore = 0;

  for (const row of index) {
    const blob = lexicalBlob(row);
    let score = 0;
    if (blob.includes(phrase)) score += 2;
    if (row.brand?.toLowerCase().includes(phrase)) score += 1.5;
    if (row.name.toLowerCase().includes(phrase)) score += 1;
    if (refEmbed.length && row.embedding?.length) {
      score += cosineSimilarity(refEmbed, row.embedding) * 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  if (!best || bestScore < 0.5) return null;

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

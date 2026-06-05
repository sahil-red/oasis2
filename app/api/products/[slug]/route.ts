import { NextResponse } from "next/server";
import { getProductBySlug } from "@/lib/products/queries";
import { resolveProductVerdict } from "@/lib/scoring/verdict-resolve";

export const revalidate = 120;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const score = product.core_scores;
  const verdict = score
    ? resolveProductVerdict({
        verdict: score.verdict,
        score: score.absolute_score ?? score.score,
        name: product.name,
        category: product.category,
        subcategory: product.subcategory,
        hazardous: Boolean(
          (score.breakdown as { hard_capped?: boolean } | null)?.hard_capped,
        ),
      })
    : null;

  return NextResponse.json(
    {
      ...product,
      verdict_resolved: verdict,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
      },
    },
  );
}

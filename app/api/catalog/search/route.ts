import { NextRequest, NextResponse } from "next/server";
import { getCachedCatalogSearch } from "@/lib/products/catalog-cache";

export const revalidate = 300;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const result = await getCachedCatalogSearch({
    q: sp.get("q") ?? undefined,
    category: sp.get("category") ?? undefined,
    subcategory: sp.get("subcategory") ?? undefined,
    usecase: sp.get("usecase") ?? undefined,
    brand: sp.get("brand") ?? undefined,
    page: sp.has("page") ? Number(sp.get("page")) : 1,
    limit: sp.has("limit") ? Number(sp.get("limit")) : 96,
    scored: sp.get("scored") ?? undefined,
    labelResolved: sp.get("labelResolved") ?? undefined,
    deepseek: sp.get("deepseek") ?? undefined,
    min: sp.get("min") ?? undefined,
    maxprice: sp.get("maxprice") ?? undefined,
    grade: sp.get("grade") ?? undefined,
    sort: sp.get("sort") ?? undefined,
    goal: sp.get("goal") ?? undefined,
    diet: sp.get("diet") ?? undefined,
    sublabel: sp.get("sublabel") ?? undefined,
    verdict: sp.get("verdict") ?? undefined,
  });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    return NextResponse.json({ items: [], total: 0, page: 1, limit: 96 });
  }
}

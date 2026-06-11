import { NextRequest, NextResponse } from "next/server";
import { getCachedCatalogMeta } from "@/lib/products/catalog-cache";

export const revalidate = 300;

export async function GET(req: NextRequest) {
  try {
    const category = req.nextUrl.searchParams.get("category") ?? undefined;
    const meta = await getCachedCatalogMeta(category);
    return NextResponse.json(meta, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    return NextResponse.json({ brands: [], categories: [], subcategories: [], l3Categories: [], useCases: [] });
  }
}

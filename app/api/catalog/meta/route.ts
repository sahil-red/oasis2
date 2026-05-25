import { NextRequest, NextResponse } from "next/server";
import { getCachedCatalogMeta } from "@/lib/products/catalog-cache";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") ?? undefined;
  const meta = await getCachedCatalogMeta(category);
  return NextResponse.json(meta, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

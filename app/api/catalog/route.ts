import { NextResponse } from "next/server";
import { getCachedCatalog } from "@/lib/products/catalog-cache";

/** Large JSON payload — must not be statically cached at build (2MB Vercel limit). */
export const dynamic = "force-dynamic";
export const revalidate = 120;

export async function GET() {
  const products = await getCachedCatalog();
  return NextResponse.json(products, {
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
    },
  });
}

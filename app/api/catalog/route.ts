import { NextResponse } from "next/server";
import { getCachedCatalog } from "@/lib/products/catalog-cache";

export const revalidate = 120;

export async function GET() {
  const products = await getCachedCatalog();
  return NextResponse.json(products, {
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
    },
  });
}

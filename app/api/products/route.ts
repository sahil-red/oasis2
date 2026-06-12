import { NextResponse } from "next/server";
import { getProductsBySlugs } from "@/lib/products/queries";

export const revalidate = 60;

/** Resolve cart slugs to product rows (small payload, no full catalog). */
export async function GET(request: Request) {
  try {
    const slugs = new URL(request.url).searchParams.get("slugs")?.split(",").filter(Boolean) ?? [];
    if (!slugs.length) {
      return NextResponse.json([], {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
      });
    }
    const unique = [...new Set(slugs)].slice(0, 40);
    const products = await getProductsBySlugs(unique);
    return NextResponse.json(products, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    console.error("[api/products] failed:", e);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
}

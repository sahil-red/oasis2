import { NextRequest, NextResponse } from "next/server";
import { dietFromParam } from "@/lib/diet/types";
import { goalFromParam } from "@/lib/goals/types";
import { searchCatalogGrid } from "@/lib/products/queries";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const goal = goalFromParam(sp.get("goal") ?? undefined);
  const diet = dietFromParam(sp.get("diet") ?? undefined);

  const result = await searchCatalogGrid({
    q: sp.get("q") ?? undefined,
    category: sp.get("category") ?? undefined,
    subcategory: sp.get("subcategory") ?? undefined,
    usecase: sp.get("usecase") ?? undefined,
    brand: sp.get("brand") ?? undefined,
    page: sp.has("page") ? Number(sp.get("page")) : 1,
    limit: sp.has("limit") ? Number(sp.get("limit")) : 96,
    onlyScored: sp.get("scored") === "1",
    goal,
    diet,
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}

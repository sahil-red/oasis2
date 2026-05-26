import { NextRequest, NextResponse } from "next/server";
import { dietFromParam } from "@/lib/diet/types";
import { goalFromParam } from "@/lib/goals/types";
import { sortFromParam } from "@/lib/products/catalog-sort";
import { searchCatalogGrid } from "@/lib/products/queries";
import type { Grade } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 120;

function parseGrade(raw: string | null): Grade | "" {
  const g = (raw ?? "").toUpperCase();
  return g === "A" || g === "B" || g === "C" || g === "D" ? (g as Grade) : "";
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const goal = goalFromParam(sp.get("goal") ?? undefined);
  const diet = dietFromParam(sp.get("diet") ?? undefined);
  const minRaw = sp.get("min");
  const maxRaw = sp.get("maxprice");

  const result = await searchCatalogGrid({
    q: sp.get("q") ?? undefined,
    category: sp.get("category") ?? undefined,
    subcategory: sp.get("subcategory") ?? undefined,
    usecase: sp.get("usecase") ?? undefined,
    brand: sp.get("brand") ?? undefined,
    page: sp.has("page") ? Number(sp.get("page")) : 1,
    limit: sp.has("limit") ? Number(sp.get("limit")) : 96,
    onlyScored: sp.get("scored") === "1",
    minScore: minRaw ? Number(minRaw) : 0,
    maxPrice: maxRaw ? Number(maxRaw) : 0,
    grade: parseGrade(sp.get("grade")),
    sort: sortFromParam(sp.get("sort") ?? undefined),
    goal,
    diet,
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
    },
  });
}

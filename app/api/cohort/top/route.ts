import { NextRequest, NextResponse } from "next/server";
import { getTopInCohort } from "@/lib/products/queries";

export const revalidate = 600;

export async function GET(req: NextRequest) {
  const cohortId = req.nextUrl.searchParams.get("id");
  if (!cohortId) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const limit = Math.min(20, Number(req.nextUrl.searchParams.get("limit") ?? 10));
  const items = await getTopInCohort(cohortId, limit);
  return NextResponse.json(
    { cohort_id: cohortId, items },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1200" } },
  );
}

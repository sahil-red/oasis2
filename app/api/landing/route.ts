import { NextResponse } from "next/server";
import { getCachedLandingInsights } from "@/lib/products/catalog-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCachedLandingInsights();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json(
      { totalScored: 0, avgScore: 0, facts: [], pickOfDay: null, goalBoards: [] },
      { status: 200 },
    );
  }
}

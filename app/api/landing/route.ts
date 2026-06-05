import { NextResponse } from "next/server";
import { getCachedLandingInsights } from "@/lib/products/catalog-cache";

export const revalidate = 600;

export async function GET() {
  try {
    const data = await getCachedLandingInsights();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=1200" },
    });
  } catch {
    return NextResponse.json(
      {
        totalScored: 0,
        avgScore: 0,
        facts: [],
        pickOfDay: null,
        goalBoards: [],
        bestInClass: [],
        dodgeList: [],
        worthItList: [],
      },
      { status: 200 },
    );
  }
}

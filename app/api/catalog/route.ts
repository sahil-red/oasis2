import { NextResponse } from "next/server";

/** Legacy full-catalog endpoint — use /api/catalog/search and /api/catalog/meta instead. */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { error: "Use /api/catalog/search and /api/catalog/meta" },
    { status: 410 },
  );
}

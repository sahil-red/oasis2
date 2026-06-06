import { NextResponse } from "next/server";
import { isSearchV2Enabled } from "@/lib/search/v2/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ enabled: isSearchV2Enabled() });
}

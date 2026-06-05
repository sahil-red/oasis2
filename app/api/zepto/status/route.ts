import { NextResponse } from "next/server";
import { getZeptoConnection } from "@/lib/zepto/connection-store";
import { zeptoConnectionKeyFromCookieHeader } from "@/lib/zepto/request";

export async function GET(request: Request) {
  const key = zeptoConnectionKeyFromCookieHeader(request.headers.get("cookie"));
  if (!key) {
    return NextResponse.json({ connected: false });
  }

  try {
    const conn = await getZeptoConnection(key);
    if (!conn) {
      return NextResponse.json({ connected: false });
    }
    return NextResponse.json({
      connected: true,
      scopes: conn.scopes,
      expires_at: conn.expires_at,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

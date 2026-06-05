import { NextResponse } from "next/server";
import { deleteZeptoConnection } from "@/lib/zepto/connection-store";
import { ZEPTO_CONN_COOKIE } from "@/lib/zepto/cookies";
import { zeptoConnectionKeyFromCookieHeader } from "@/lib/zepto/request";

export async function POST(request: Request) {
  const key = zeptoConnectionKeyFromCookieHeader(request.headers.get("cookie"));
  if (key) {
    try {
      await deleteZeptoConnection(key);
    } catch {
      // still clear cookie
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ZEPTO_CONN_COOKIE);
  return res;
}

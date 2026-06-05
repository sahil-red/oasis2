import { ZEPTO_CONN_COOKIE } from "@/lib/zepto/cookies";

export function zeptoConnectionKeyFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const raw = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ZEPTO_CONN_COOKIE}=`))
    ?.slice(ZEPTO_CONN_COOKIE.length + 1);
  return raw ? decodeURIComponent(raw) : null;
}

import { NextResponse } from "next/server";
import { exchangeZeptoCode } from "@/lib/zepto/oauth";
import { upsertZeptoConnection } from "@/lib/zepto/connection-store";
import { parseOAuthPendingCookie, ZEPTO_CONN_COOKIE, ZEPTO_OAUTH_COOKIE } from "@/lib/zepto/cookies";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthErr = url.searchParams.get("error");

  const pendingRaw = request.headers.get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ZEPTO_OAUTH_COOKIE}=`))
    ?.slice(ZEPTO_OAUTH_COOKIE.length + 1);

  const pending = parseOAuthPendingCookie(
    pendingRaw ? decodeURIComponent(pendingRaw) : undefined,
  );

  const fail = (msg: string, returnTo = "/basket") => {
    const dest = new URL(returnTo, request.url);
    dest.searchParams.set("zepto_error", msg.slice(0, 120));
    const res = NextResponse.redirect(dest);
    res.cookies.delete(ZEPTO_OAUTH_COOKIE);
    return res;
  };

  if (oauthErr) {
    return fail(oauthErr, pending?.returnTo ?? "/basket");
  }

  if (!code || !state || !pending) {
    return fail("Missing OAuth state — try connecting again");
  }

  if (state !== pending.state) {
    return fail("OAuth state mismatch — try connecting again", pending.returnTo);
  }

  try {
    const tokens = await exchangeZeptoCode({
      code,
      codeVerifier: pending.verifier,
    });

    await upsertZeptoConnection({
      connectionKey: pending.connectionKey,
      tokens,
    });

    const returnTo = pending.returnTo ?? "/basket";
    const dest = new URL(returnTo, request.url);
    dest.searchParams.set("zepto", "connected");

    const res = NextResponse.redirect(dest);
    res.cookies.set(ZEPTO_CONN_COOKIE, pending.connectionKey, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
    res.cookies.delete(ZEPTO_OAUTH_COOKIE);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange failed";
    return fail(message, pending.returnTo ?? "/basket");
  }
}

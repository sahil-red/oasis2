import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildZeptoAuthorizationUrl,
  generatePkce,
  randomState,
} from "@/lib/zepto/oauth";
import { ZEPTO_OAUTH_COOKIE } from "@/lib/zepto/cookies";

export async function GET(request: Request) {
  try {
    const { verifier, challenge } = generatePkce();
    const state = randomState();
    const connectionKey = randomUUID();
    const returnTo = new URL(request.url).searchParams.get("return") || "/basket";

    const authUrl = await buildZeptoAuthorizationUrl({
      state,
      codeChallenge: challenge,
    });

    const res = NextResponse.redirect(authUrl);
    const pending = JSON.stringify({
      state,
      verifier,
      connectionKey,
      returnTo: returnTo.startsWith("/") ? returnTo : "/basket",
    });
    res.cookies.set(ZEPTO_OAUTH_COOKIE, pending, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Zepto OAuth failed";
    const url = new URL("/basket", request.url);
    url.searchParams.set("zepto_error", message.slice(0, 120));
    return NextResponse.redirect(url);
  }
}

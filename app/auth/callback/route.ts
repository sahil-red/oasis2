import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

/** Google OAuth callback — exchange code for session, redirect to profile */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") ?? "/profile";

  if (code) {
    try {
      if (supabase) await supabase.auth.exchangeCodeForSession(code);
    } catch {
      /* ignore */
    }
  }

  return NextResponse.redirect(new URL(next, req.nextUrl.origin));
}

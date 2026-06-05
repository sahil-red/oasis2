import { NextRequest, NextResponse } from "next/server";
import { consumeAiSearch } from "@/lib/auth/profile";
import { supabaseFromBearer } from "@/lib/auth/supabase-user";
import { runAiProductSearch } from "@/lib/search/ai-search";
import { parseProductQueryWithDeepseek } from "@/lib/search/query-parse";

// Prompt-specific results cannot be shared across users — keep private.
// But the underlying product pool is cached inside runAiProductSearch.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    prompt?: unknown;
    limit?: unknown;
  } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 2) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const limit = typeof body?.limit === "number" ? body.limit : undefined;

  const client = supabaseFromBearer(req.headers.get("authorization"));
  if (client) {
    const { data: userData } = await client.auth.getUser();
    if (userData.user) {
      const gate = await consumeAiSearch(client, userData.user.id);
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.reason, code: "quota_exceeded" },
          { status: 402 },
        );
      }
    }
  }

  const parsed = await parseProductQueryWithDeepseek(prompt);
  const result = await runAiProductSearch(parsed, { limit, prompt });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}

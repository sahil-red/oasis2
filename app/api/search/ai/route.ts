import { NextRequest, NextResponse } from "next/server";
import { consumeAiSearch } from "@/lib/auth/profile";
import { supabaseFromBearer } from "@/lib/auth/supabase-user";
import { runAiProductSearch } from "@/lib/search/ai-search";
import { classifyIntent } from "@/lib/search/intent-classify";
import {
  getCachedAiResult,
  getCachedParse,
  setCachedAiResult,
  setCachedParse,
} from "@/lib/search/search-cache";
import {
  heuristicParseProductQuery,
  parseProductQueryWithDeepseek,
} from "@/lib/search/query-parse";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    prompt?: unknown;
    limit?: unknown;
    tier?: unknown;
  } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 2) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const limit = typeof body?.limit === "number" ? body.limit : undefined;
  const tier =
    body?.tier === "lexical" || body?.tier === "structured" || body?.tier === "complex"
      ? body.tier
      : classifyIntent(prompt);

  if (tier === "lexical") {
    return NextResponse.json(
      { error: "Use catalog search for lexical queries", code: "lexical_route" },
      { status: 400 },
    );
  }

  const cached = getCachedAiResult(prompt, limit ?? 24);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  }

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

  let parsed = getCachedParse(prompt);
  if (!parsed) {
    parsed =
      tier === "complex"
        ? await parseProductQueryWithDeepseek(prompt)
        : { parsed: heuristicParseProductQuery(prompt), source: "heuristic" as const };
    setCachedParse(prompt, parsed);
  }

  const result = await runAiProductSearch(parsed, { limit, prompt, tier });
  setCachedAiResult(prompt, limit ?? 24, result);

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, max-age=300",
    },
  });
}

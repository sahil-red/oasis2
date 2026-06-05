import { NextRequest, NextResponse } from "next/server";
import { consumeAiSearch } from "@/lib/auth/profile";
import { supabaseFromBearer } from "@/lib/auth/supabase-user";
import { runAiProductSearch } from "@/lib/search/ai-search";
import {
  getCachedAiResult,
  getCachedParse,
  setCachedAiResult,
  setCachedParse,
} from "@/lib/search/search-cache";
import { mergeSavedPreferences } from "@/lib/search/merge-preferences";
import { heuristicParseProductQuery } from "@/lib/search/query-parse";
import type { AiSearchPreferences } from "@/lib/search/ai-usage";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    prompt?: unknown;
    limit?: unknown;
    tier?: unknown;
    preferences?: AiSearchPreferences | null;
  } | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 2) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const limit = typeof body?.limit === "number" ? body.limit : undefined;
  const tier =
    body?.tier === "structured" || body?.tier === "complex" ? body.tier : "structured";

  const preferences = body?.preferences ?? null;

  // Cache key includes preferences so User A's vegan-filtered results never leak to User B.
  const cached = getCachedAiResult(prompt, limit ?? 24, tier, preferences);
  if (cached) {
    return NextResponse.json(cached, { headers: CACHE_HEADERS });
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
    parsed = { parsed: heuristicParseProductQuery(prompt), source: "heuristic" as const };
    setCachedParse(prompt, parsed);
  }

  const parseForSearch = {
    ...parsed,
    parsed: mergeSavedPreferences(parsed.parsed, preferences),
  };

  const result = await runAiProductSearch(parseForSearch, { limit, prompt, tier });

  setCachedAiResult(prompt, limit ?? 24, tier, result, preferences);

  return NextResponse.json(result, { headers: CACHE_HEADERS });
}

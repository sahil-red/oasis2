import { NextRequest, NextResponse } from "next/server";
import { consumeAiSearch } from "@/lib/auth/profile";
import { supabaseFromBearer } from "@/lib/auth/supabase-user";
import { runAiProductSearch, shouldEscalateStructuredToComplex } from "@/lib/search/ai-search";
import { classifyIntent } from "@/lib/search/intent-classify";
import {
  getCachedAiResult,
  getCachedParse,
  setCachedAiResult,
  setCachedParse,
} from "@/lib/search/search-cache";
import { mergeSavedPreferences } from "@/lib/search/merge-preferences";
import {
  heuristicParseProductQuery,
  parseProductQueryWithDeepseek,
} from "@/lib/search/query-parse";
import type { AiSearchPreferences } from "@/lib/search/ai-usage";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
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
  let tier =
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
    parsed =
      tier === "complex"
        ? await parseProductQueryWithDeepseek(prompt)
        : { parsed: heuristicParseProductQuery(prompt), source: "heuristic" as const };
    setCachedParse(prompt, parsed);
  }

  const preferences = body?.preferences ?? null;
  const parseForSearch = {
    ...parsed,
    parsed: mergeSavedPreferences(parsed.parsed, preferences),
  };

  let result = await runAiProductSearch(parseForSearch, { limit, prompt, tier });

  if (shouldEscalateStructuredToComplex(tier, result, limit ?? 24)) {
    const complexParse =
      parsed.source === "deepseek"
        ? parsed
        : await parseProductQueryWithDeepseek(prompt).catch(() => parsed);
    if (complexParse.source === "deepseek") setCachedParse(prompt, complexParse);
    result = await runAiProductSearch(
      { ...complexParse, parsed: mergeSavedPreferences(complexParse.parsed, preferences) },
      { limit, prompt, tier: "complex" },
    );
    result = { ...result, intent_tier: "complex" };
  }

  setCachedAiResult(prompt, limit ?? 24, result);

  return NextResponse.json(result, { headers: CACHE_HEADERS });
}

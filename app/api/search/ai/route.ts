import { NextRequest, NextResponse } from "next/server";
import { consumeAiSearch } from "@/lib/auth/profile";
import { supabaseFromBearer } from "@/lib/auth/supabase-user";
import { adminClient } from "@/lib/supabase/admin";
import {
  getCachedAiResult,
  getCachedParse,
  setCachedAiResult,
  setCachedParse,
} from "@/lib/search/search-cache";
import { mergeSavedPreferences } from "@/lib/search/merge-preferences";
import { heuristicParseProductQuery } from "@/lib/search/query-parse";
import type { AiSearchPreferences } from "@/lib/search/ai-usage";
import { runSearchV2 } from "@/lib/search/v2/pipeline";
import { searchV2ToAiResult } from "@/lib/search/v2/adapter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CACHE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

// In-memory rate limiter for anonymous requests (3 free per hour, per IP)
const anonRateLimit = new Map<string, { start: number; count: number }>();

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
  } else {
    // Anonymous users: 3 free searches, then prompt sign-in
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const anonKey = `anon:${ip}`;
    const now = Date.now();
    const window = anonRateLimit.get(anonKey);
    if (window && now - window.start < 3_600_000) {
      if (window.count >= 3) {
        return NextResponse.json(
          { error: "Sign in for unlimited searches — it's free.", code: "sign_in_required" },
          { status: 401 },
        );
      }
      window.count++;
    } else {
      anonRateLimit.set(anonKey, { start: now, count: 1 });
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

  let userId: string | null = null;
  if (client) {
    const { data: ud } = await client.auth.getUser();
    if (ud.user) userId = ud.user.id;
  }

  try {
    const v2Result = await runSearchV2(prompt, { limit, preferences });
    const result = await searchV2ToAiResult(v2Result, { limit, parseSource: parseForSearch.source });
    setCachedAiResult(prompt, limit ?? 24, tier, result, preferences);

    // Record search in history for logged-in users (fire-and-forget, non-blocking)
    if (userId) {
      const supabase = adminClient();
      void supabase.from("search_history").insert({
        user_id: userId,
        query: prompt.slice(0, 200),
        intent_tier: result.intent_tier ?? tier,
        rank_source: result.rank_source,
        result_count: result.items.length,
      });
    }

    return NextResponse.json(result, { headers: CACHE_HEADERS });
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI search failed";
    console.error("[search/ai]", message);
    return NextResponse.json({ error: message, items: [] }, { status: 200 });
  }
}

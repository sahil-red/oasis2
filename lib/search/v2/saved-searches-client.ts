"use client";

import type { AiSearchPreferences } from "@/lib/search/ai-usage";

async function authHeaders(accessToken: string | undefined): Promise<HeadersInit> {
  if (!accessToken) throw new Error("Sign in to save searches");
  return {
    "content-type": "application/json",
    authorization: `Bearer ${accessToken}`,
  };
}

export async function saveSearch(
  accessToken: string | undefined,
  opts: { query: string; label?: string; preferences?: AiSearchPreferences | null; alert_enabled?: boolean },
): Promise<{ id: string }> {
  const res = await fetch("/api/me/saved-searches", {
    method: "POST",
    headers: await authHeaders(accessToken),
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { saved_search: { id: string } };
  return { id: data.saved_search.id };
}

export async function listSavedSearches(accessToken: string | undefined) {
  if (!accessToken) return [];
  const res = await fetch("/api/me/saved-searches", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { saved_searches: unknown[] };
  return data.saved_searches ?? [];
}

export async function runSearchAlerts(accessToken: string | undefined) {
  if (!accessToken) return { triggered: [] };
  const res = await fetch("/api/me/search-alerts", {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { triggered: [] };
  return (await res.json()) as { triggered: Array<{ id: string; query: string; new_matches: number }> };
}

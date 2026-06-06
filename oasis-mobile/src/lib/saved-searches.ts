import { API_BASE } from "@/lib/config";
import type { SavedSearchRow } from "@/types/api";

export async function listSavedSearches(token: string | null): Promise<SavedSearchRow[]> {
  if (!token) return [];
  const res = await fetch(`${API_BASE}/api/me/saved-searches`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { saved_searches?: SavedSearchRow[] };
  return data.saved_searches ?? [];
}

export async function saveSearch(
  token: string | null,
  opts: { query: string; label?: string; alert_enabled?: boolean },
): Promise<{ id: string }> {
  if (!token) throw new Error("Sign in to save searches");
  const res = await fetch(`${API_BASE}/api/me/saved-searches`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { saved_search: { id: string } };
  return { id: data.saved_search.id };
}

export async function deleteSavedSearch(token: string | null, id: string): Promise<void> {
  if (!token) throw new Error("Sign in to delete saved searches");
  const res = await fetch(`${API_BASE}/api/me/saved-searches?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
}

export async function updateSavedSearch(
  token: string | null,
  opts: { id: string; alert_enabled?: boolean; label?: string },
): Promise<SavedSearchRow> {
  if (!token) throw new Error("Sign in to update saved searches");
  const res = await fetch(`${API_BASE}/api/me/saved-searches`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { saved_search: SavedSearchRow };
  return data.saved_search;
}

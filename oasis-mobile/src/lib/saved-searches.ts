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

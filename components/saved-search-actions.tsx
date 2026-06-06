"use client";

import { useEffect, useState } from "react";
import { Bell, Bookmark } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import type { AiSearchPreferences } from "@/lib/search/ai-usage";
import { saveSearch } from "@/lib/search/v2/saved-searches-client";

export function SavedSearchActions({
  query,
  preferences,
}: {
  query: string;
  preferences?: AiSearchPreferences | null;
}) {
  const auth = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [v2Enabled, setV2Enabled] = useState<boolean | null>(null);

  useEffect(() => {
    void fetch("/api/search/v2-status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setV2Enabled(Boolean(d.enabled)))
      .catch(() => setV2Enabled(false));
  }, []);

  if (!query.trim()) return null;

  async function handleSave(alert: boolean) {
    if (!auth?.session?.access_token) {
      setStatus("Sign in to save searches");
      return;
    }
    if (alert && v2Enabled === false) {
      setStatus("Alerts need Search V2 enabled on the server");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      await saveSearch(auth.session.access_token, {
        query,
        preferences,
        alert_enabled: alert,
      });
      setStatus(alert ? "Saved with alerts on" : "Search saved");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleSave(false)}
        className="inline-flex items-center gap-1.5 rounded-full border border-(--color-line) px-3 py-1.5 text-xs font-medium text-(--color-fg-muted) hover:border-(--color-fg-dim) hover:text-(--color-fg) disabled:opacity-50"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Save search
      </button>
      <button
        type="button"
        disabled={busy || v2Enabled === false}
        title={v2Enabled === false ? "Alerts require Search V2" : undefined}
        onClick={() => void handleSave(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-(--color-line) px-3 py-1.5 text-xs font-medium text-(--color-fg-muted) hover:border-(--color-fg-dim) hover:text-(--color-fg) disabled:opacity-50"
      >
        <Bell className="h-3.5 w-3.5" />
        Alert me
      </button>
      {status ? <span className="text-xs text-(--color-fg-dim)">{status}</span> : null}
    </div>
  );
}

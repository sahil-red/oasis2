"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

type HistoryEntry = {
  id: string;
  query: string;
  intent_tier: string | null;
  result_count: number | null;
  created_at: string;
};

function PlanBadge({ plan }: { plan: "free" | "plus" }) {
  if (plan === "plus") {
    return (
      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-400">
        Scout Plus
      </span>
    );
  }
  return (
    <span className="rounded-full border border-(--color-line) bg-(--color-bg-soft) px-3 py-1 text-[11px] font-medium text-(--color-fg-dim)">
      Free
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-(--color-fg-dim)">{label}</p>
      <p className="mt-1 font-display text-3xl text-(--color-fg)">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-(--color-fg-dim)">{sub}</p> : null}
    </div>
  );
}

export default function ProfilePage() {
  const { ready, session, profile, signOut } = useAuth();
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [clearingHistory, setClearingHistory] = useState(false);

  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  const loadHistory = useCallback(async () => {
    if (!session) return;
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history", {
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json() as { history: HistoryEntry[] };
      setHistory(data.history ?? []);
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, [session]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const deleteHistory = async (id?: string) => {
    if (!session) return;
    if (!id) setClearingHistory(true);
    try {
      await fetch(`/api/history${id ? `?id=${id}` : ""}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      setHistory((prev) => id ? prev.filter((h) => h.id !== id) : []);
    } finally {
      setClearingHistory(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  if (!ready || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--color-bg)">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-(--color-line) border-t-(--color-fg)" />
      </div>
    );
  }

  const email = profile?.email ?? session.user?.email ?? null;
  const phone = profile?.phone ?? session.user?.phone ?? null;
  const displayName = profile?.full_name ?? email?.split("@")[0] ?? phone ?? "Scout user";

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  return (
    <main className="min-h-screen bg-(--color-bg)">
      <SiteNav />
      <div className="mx-auto max-w-2xl px-5 pb-20 pt-8 md:px-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-(--color-fg-dim)">
              Your account
            </p>
            <h1 className="font-display mt-2 text-3xl text-(--color-fg)">{displayName}</h1>
            {email ? (
              <p className="mt-1 text-sm text-(--color-fg-muted)">{email}</p>
            ) : phone ? (
              <p className="mt-1 text-sm text-(--color-fg-muted)">+91 {phone}</p>
            ) : null}
          </div>
          <PlanBadge plan={profile?.plan ?? "free"} />
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Plan"
            value={profile?.plan === "plus" ? "Plus" : "Free"}
            sub={profile?.plan === "plus" ? "Unlimited AI search" : undefined}
          />
          <StatCard
            label="AI searches"
            value={profile?.plan === "plus" ? "∞" : (profile?.ai_searches_remaining ?? 0)}
            sub={profile?.plan === "free" ? "left today" : undefined}
          />
          <StatCard
            label="Searches saved"
            value={history.length}
            sub="in history"
          />
        </div>

        {/* Upgrade CTA */}
        {profile?.plan === "free" ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
            <p className="font-semibold text-(--color-fg)">Upgrade to Scout Plus</p>
            <p className="mt-1 text-sm text-(--color-fg-muted)">
              Unlimited AI searches, priority results. ₹199/month.
            </p>
            <Link
              href="/subscribe"
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
            >
              Upgrade →
            </Link>
          </div>
        ) : null}

        {/* Search History */}
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-(--color-fg)">Search history</h2>
            {history.length > 0 ? (
              <button
                onClick={() => void deleteHistory()}
                disabled={clearingHistory}
                className="text-[12px] text-(--color-fg-dim) underline underline-offset-2 hover:text-(--color-fg)"
              >
                {clearingHistory ? "Clearing…" : "Clear all"}
              </button>
            ) : null}
          </div>

          {historyLoading ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-(--color-bg-soft)" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="mt-6 rounded-xl border border-(--color-line) bg-(--color-panel) py-10 text-center">
              <p className="text-sm text-(--color-fg-muted)">No search history yet.</p>
              <Link href="/search" className="mt-3 inline-block text-[13px] font-medium text-(--color-accent) hover:underline">
                Start searching →
              </Link>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-(--color-line) overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel)">
              {history.map((h) => (
                <div key={h.id} className="group flex items-center gap-3 px-4 py-3">
                  <Link
                    href={`/search?prompt=${encodeURIComponent(h.query)}`}
                    className="min-w-0 flex-1"
                  >
                    <p className="truncate text-[14px] text-(--color-fg) group-hover:text-(--color-accent)">
                      {h.query}
                    </p>
                    <p className="mt-0.5 text-[11px] text-(--color-fg-dim)">
                      {formatDate(h.created_at)}
                      {h.result_count != null ? ` · ${h.result_count} results` : ""}
                      {h.intent_tier ? ` · ${h.intent_tier}` : ""}
                    </p>
                  </Link>
                  <button
                    onClick={() => void deleteHistory(h.id)}
                    className="flex-shrink-0 opacity-0 transition group-hover:opacity-100 text-(--color-fg-dim) hover:text-(--color-fg)"
                    title="Remove"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M1 1l12 12M13 1 1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Account actions */}
        <div className="mt-10 space-y-2 border-t border-(--color-line) pt-8">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-3 text-sm font-medium text-(--color-fg-muted) transition hover:border-(--color-fg-muted) hover:text-(--color-fg)"
          >
            Sign out
          </button>
        </div>

      </div>
      <SiteFooter />
    </main>
  );
}

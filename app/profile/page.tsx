"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { supabase as supabaseClient } from "@/lib/supabase/client";

type HistoryEntry = {
  id: string;
  query: string;
  intent_tier: string | null;
  result_count: number | null;
  created_at: string;
};

type Identity = {
  provider: string;
  identity_data?: { email?: string; phone?: string };
};

export default function ProfilePage() {
  const { ready, session, profile, signInWithGoogle, signOut, refreshProfile } = useAuth();
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [linkingPhone, setLinkingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [linkStep, setLinkStep] = useState<"idle" | "phone" | "otp">("idle");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

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
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }, [session]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // Load linked identities
  useEffect(() => {
    if (!session || !supabaseClient) return;
    supabaseClient.auth.getUserIdentities().then(({ data }) => {
      setIdentities((data?.identities ?? []) as Identity[]);
    });
  }, [session]);

  const handleLinkGoogle = async () => {
    if (!supabaseClient) return;
    setLinkError(null);
    await supabaseClient.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const handleSendLinkOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseClient) return;
    setLinkLoading(true);
    setLinkError(null);
    try {
      const phone = phoneInput.startsWith("+") ? phoneInput : `+91${phoneInput.replace(/\D/g, "")}`;
      const { error } = await supabaseClient.auth.signInWithOtp({ phone });
      if (error) throw error;
      setLinkStep("otp");
    } catch (e) { setLinkError((e as Error).message); }
    finally { setLinkLoading(false); }
  };

  const handleVerifyLinkOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabaseClient) return;
    setLinkLoading(true);
    setLinkError(null);
    try {
      const phone = phoneInput.startsWith("+") ? phoneInput : `+91${phoneInput.replace(/\D/g, "")}`;
      const { error } = await supabaseClient.auth.verifyOtp({ phone, token: otpInput, type: "sms" });
      if (error) throw error;
      setLinkStep("idle");
      setPhoneInput("");
      setOtpInput("");
      await refreshProfile();
    } catch (e) { setLinkError((e as Error).message); }
    finally { setLinkLoading(false); }
  };

  const deleteHistory = async (id?: string) => {
    if (!session) return;
    if (!id) setClearingHistory(true);
    try {
      await fetch(`/api/history${id ? `?id=${id}` : ""}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${session.access_token}` },
      });
      setHistory(prev => id ? prev.filter(h => h.id !== id) : []);
    } finally { setClearingHistory(false); }
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
  const isUnlimited = (profile?.ai_searches_limit ?? 0) >= 9999;
  const isPlus = profile?.plan === "plus";

  const hasGoogle = identities.some(i => i.provider === "google");
  const hasPhone = identities.some(i => i.provider === "phone");

  function formatDate(iso: string) {
    const d = new Date(iso);
    const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
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
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-8 md:px-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-(--color-fg) font-display text-2xl text-(--color-bg)">
              {displayName[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <h1 className="font-display text-2xl text-(--color-fg)">{displayName}</h1>
              <p className="mt-0.5 text-sm text-(--color-fg-muted)">
                {email ?? phone ?? "No contact linked"}
              </p>
            </div>
          </div>
          <span className={`mt-1 flex-shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${
            isPlus
              ? "border border-amber-500/40 bg-amber-500/10 text-amber-400"
              : isUnlimited
              ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border border-(--color-line) bg-(--color-bg-soft) text-(--color-fg-dim)"
          }`}>
            {isPlus ? "Scout Plus" : isUnlimited ? "Team" : "Free"}
          </span>
        </div>

        {/* Stats row */}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            {
              label: "AI searches",
              value: isUnlimited ? "∞" : profile?.ai_searches_remaining ?? 0,
              sub: isUnlimited ? "unlimited" : "left today",
            },
            { label: "Queries saved", value: history.length, sub: "in history" },
            { label: "Daily limit", value: isUnlimited ? "∞" : profile?.ai_searches_limit ?? 10, sub: "per day" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-(--color-fg-dim)">{s.label}</p>
              <p className="mt-1 font-display text-3xl text-(--color-fg)">{s.value}</p>
              <p className="mt-0.5 text-[11px] text-(--color-fg-dim)">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Upgrade CTA */}
        {!isPlus && !isUnlimited ? (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-(--color-fg)">Upgrade to Scout Plus</p>
                <p className="mt-1 text-[13px] text-(--color-fg-muted)">
                  Unlimited AI searches, priority results, basket sync.
                </p>
              </div>
              <Link
                href="/subscribe"
                className="flex-shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
              >
                ₹199/mo
              </Link>
            </div>
          </div>
        ) : null}

        {/* Linked accounts */}
        <div className="mt-8">
          <h2 className="font-display text-xl text-(--color-fg)">Linked accounts</h2>
          <p className="mt-1 text-[13px] text-(--color-fg-muted)">Connect multiple sign-in methods to your account.</p>
          <div className="mt-4 space-y-2">
            {/* Google */}
            <div className="flex items-center justify-between rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-3">
              <div className="flex items-center gap-3">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.25-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
                </svg>
                <div>
                  <p className="text-[13px] font-medium text-(--color-fg)">Google</p>
                  {hasGoogle && email ? <p className="text-[11px] text-(--color-fg-dim)">{email}</p> : null}
                </div>
              </div>
              {hasGoogle ? (
                <span className="text-[11px] font-medium text-emerald-500">Connected</span>
              ) : (
                <button onClick={handleLinkGoogle} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-[12px] font-medium text-(--color-fg-muted) transition hover:text-(--color-fg)">
                  Connect
                </button>
              )}
            </div>

            {/* Phone */}
            <div className="rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">📱</span>
                  <div>
                    <p className="text-[13px] font-medium text-(--color-fg)">Phone (OTP)</p>
                    {hasPhone && phone ? <p className="text-[11px] text-(--color-fg-dim)">{phone}</p> : null}
                  </div>
                </div>
                {hasPhone ? (
                  <span className="text-[11px] font-medium text-emerald-500">Connected</span>
                ) : linkStep === "idle" ? (
                  <button
                    onClick={() => setLinkStep("phone")}
                    className="rounded-lg border border-(--color-line) px-3 py-1.5 text-[12px] font-medium text-(--color-fg-muted) transition hover:text-(--color-fg)"
                  >
                    Connect
                  </button>
                ) : null}
              </div>
              {linkStep === "phone" ? (
                <form onSubmit={handleSendLinkOtp} className="mt-3 flex gap-2">
                  <div className="flex flex-1 overflow-hidden rounded-lg border border-(--color-line-strong)">
                    <span className="flex items-center border-r border-(--color-line) bg-(--color-bg-soft) px-2.5 text-xs text-(--color-fg-dim)">+91</span>
                    <input
                      type="tel" value={phoneInput} onChange={e => setPhoneInput(e.target.value)}
                      placeholder="98765 43210"
                      className="flex-1 bg-(--color-bg) px-2.5 py-2 text-sm text-(--color-fg) outline-none"
                      required
                    />
                  </div>
                  <button type="submit" disabled={linkLoading} className="rounded-lg bg-(--color-fg) px-3 py-2 text-xs font-semibold text-(--color-bg) disabled:opacity-50">
                    {linkLoading ? "…" : "Send"}
                  </button>
                  <button type="button" onClick={() => setLinkStep("idle")} className="text-xs text-(--color-fg-dim)">Cancel</button>
                </form>
              ) : linkStep === "otp" ? (
                <form onSubmit={handleVerifyLinkOtp} className="mt-3 flex gap-2">
                  <input
                    type="text" inputMode="numeric" maxLength={6}
                    value={otpInput} onChange={e => setOtpInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="6-digit code"
                    className="flex-1 rounded-lg border border-(--color-line-strong) bg-(--color-bg) px-3 py-2 text-center text-sm tracking-widest text-(--color-fg) outline-none"
                    required
                  />
                  <button type="submit" disabled={linkLoading || otpInput.length < 6} className="rounded-lg bg-(--color-fg) px-3 py-2 text-xs font-semibold text-(--color-bg) disabled:opacity-50">
                    {linkLoading ? "…" : "Verify"}
                  </button>
                </form>
              ) : null}
              {linkError ? <p className="mt-2 text-[11px] text-red-400">{linkError}</p> : null}
            </div>
          </div>
        </div>

        {/* Search History */}
        <div className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-(--color-fg)">Search history</h2>
            {history.length > 0 ? (
              <button onClick={() => void deleteHistory()} disabled={clearingHistory}
                className="text-[12px] text-(--color-fg-dim) underline underline-offset-2 hover:text-(--color-fg)">
                {clearingHistory ? "Clearing…" : "Clear all"}
              </button>
            ) : null}
          </div>
          {historyLoading ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-(--color-bg-soft)" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="mt-4 rounded-xl border border-(--color-line) bg-(--color-panel) py-10 text-center">
              <p className="text-sm text-(--color-fg-muted)">No searches yet.</p>
              <Link href="/search" className="mt-2 inline-block text-[13px] font-medium text-(--color-accent) hover:underline">
                Start searching →
              </Link>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-(--color-line) overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel)">
              {history.map(h => (
                <div key={h.id} className="group flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/search?prompt=${encodeURIComponent(h.query)}`}
                      className="block truncate text-[14px] text-(--color-fg) hover:text-(--color-accent)">
                      {h.query}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-(--color-fg-dim)">
                      {formatDate(h.created_at)}
                      {h.result_count != null ? ` · ${h.result_count} results` : ""}
                      {h.intent_tier ? ` · ${h.intent_tier}` : ""}
                    </p>
                  </div>
                  <button onClick={() => void deleteHistory(h.id)}
                    className="flex-shrink-0 opacity-0 transition group-hover:opacity-60 hover:!opacity-100 text-(--color-fg-dim)"
                    title="Remove">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1 1l10 10M11 1 1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="mt-10 border-t border-(--color-line) pt-8">
          <button onClick={() => { void signOut().then(() => router.replace("/")); }}
            className="w-full rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-3 text-sm font-medium text-(--color-fg-muted) transition hover:border-(--color-fg-muted) hover:text-(--color-fg)">
            Sign out
          </button>
        </div>

      </div>
      <SiteFooter />
    </main>
  );
}

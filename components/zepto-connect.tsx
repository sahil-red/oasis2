"use client";

import { useCallback, useEffect, useState } from "react";
import { readBasket } from "@/lib/basket/storage";

type SyncResult = {
  slug: string;
  name: string;
  status: string;
  reason?: string;
};

export function ZeptoConnectPanel({ returnPath = "/basket" }: { returnPath?: string }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncDetail, setSyncDetail] = useState<SyncResult[] | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/zepto/status");
      const data = (await res.json()) as { connected?: boolean };
      setConnected(Boolean(data.connected));
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("zepto") === "connected") {
      setMessage("Zepto account connected. You can sync your Scout basket now.");
      params.delete("zepto");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }
    const err = params.get("zepto_error");
    if (err) {
      setMessage(err);
      params.delete("zepto_error");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, [refreshStatus]);

  const connect = () => {
    const ret = encodeURIComponent(returnPath);
    window.location.href = `/api/zepto/oauth/start?return=${ret}`;
  };

  const disconnect = async () => {
    await fetch("/api/zepto/disconnect", { method: "POST" });
    setConnected(false);
    setMessage("Disconnected from Zepto.");
    setSyncDetail(null);
  };

  const syncCart = async () => {
    const basket = readBasket();
    if (!basket.length) {
      setMessage("Your Scout basket is empty.");
      return;
    }
    setSyncing(true);
    setMessage(null);
    setSyncDetail(null);
    try {
      const res = await fetch("/api/zepto/cart/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: basket.map((e) => ({ slug: e.slug, qty: e.qty })),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        added?: number;
        results?: SyncResult[];
        zepto_cart_url?: string;
      };
      if (!res.ok) {
        setMessage(data.error ?? "Could not sync to Zepto");
        return;
      }
      setSyncDetail(data.results ?? null);
      setMessage(
        data.added
          ? `Added ${data.added} item(s) to your Zepto cart. Open Zepto to review and checkout.`
          : "No items were added — check details below.",
      );
      if (data.zepto_cart_url) {
        (window as unknown as { __zeptoCartUrl?: string }).__zeptoCartUrl = data.zepto_cart_url;
      }
    } catch {
      setMessage("Network error while syncing to Zepto.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-4">
      <p className="text-[13px] font-semibold text-(--color-fg)">Zepto checkout</p>
      <p className="mt-1 text-[12px] leading-relaxed text-(--color-fg-muted)">
        Connect your Zepto account (Indian mobile + OTP). Scout can push your basket into your real
        Zepto cart.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {connected === null ? (
          <span className="text-[12px] text-(--color-fg-dim)">Checking connection…</span>
        ) : connected ? (
          <>
            <span className="text-[12px] font-medium text-(--score-excellent)">Connected</span>
            <button
              type="button"
              onClick={() => void syncCart()}
              disabled={syncing}
              className="rounded-full bg-(--color-fg) px-4 py-1.5 text-[12px] font-semibold text-(--color-bg) hover:opacity-90 disabled:opacity-60"
            >
              {syncing ? "Syncing…" : "Send basket to Zepto"}
            </button>
            <a
              href="https://www.zepto.com/?cart=open"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-(--color-fg) underline underline-offset-2"
            >
              Open Zepto cart
            </a>
            <button
              type="button"
              onClick={() => void disconnect()}
              className="text-[12px] text-(--color-fg-dim) underline underline-offset-2"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={connect}
            className="rounded-full bg-(--color-fg) px-4 py-1.5 text-[12px] font-semibold text-(--color-bg) hover:opacity-90"
          >
            Connect Zepto
          </button>
        )}
      </div>

      {message ? (
        <p className="mt-3 text-[12px] leading-relaxed text-(--color-fg-muted)">{message}</p>
      ) : null}

      {syncDetail?.length ? (
        <ul className="mt-2 space-y-1 text-[11px] text-(--color-fg-dim)">
          {syncDetail.map((r) => (
            <li key={r.slug}>
              {r.name}: {r.status}
              {r.reason ? ` (${r.reason})` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

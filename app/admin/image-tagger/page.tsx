"use client";

import { useCallback, useEffect, useState } from "react";

type Product = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  images: string[];
};

const BATCH_SIZE = 50;

export default function ImageTaggerPage() {
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [heroMap, setHeroMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchBatch = useCallback(async () => {
    setLoading(true);
    setHeroMap({});
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/reorder-images?count=${BATCH_SIZE}`);
      const data = (await res.json()) as {
        done: number;
        total: number;
        products: Product[];
      };
      setDone(data.done);
      setTotal(data.total);
      setProducts(data.products ?? []);
    } catch {
      setMessage("Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBatch();
  }, [fetchBatch]);

  const toggleHero = (productId: string, url: string) => {
    setHeroMap((prev) => {
      const next = { ...prev };
      if (next[productId] === url) {
        delete next[productId];
      } else {
        next[productId] = url;
      }
      return next;
    });
  };

  const heroCount = Object.keys(heroMap).length;

  const saveBatch = useCallback(async () => {
    if (heroCount === 0) return;
    setSaving(true);
    // Save selected heroes AND skip the rest
    const actions = products.map((p) => {
      const heroUrl = heroMap[p.id];
      if (heroUrl) {
        return { productId: p.id, heroUrl, reorder: true };
      }
      return { productId: p.id, skip: true };
    });
    try {
      const res = await fetch("/api/admin/reorder-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });
      if (!res.ok) throw new Error("Save failed");
      setDone((d) => d + products.length);
      setMessage(`Saved ${heroCount}, skipped ${products.length - heroCount}`);
      void fetchBatch();
    } catch {
      setMessage("Save failed");
    } finally {
      setSaving(false);
    }
  }, [heroMap, heroCount, fetchBatch]);

  const skipAll = useCallback(async () => {
    if (products.length === 0) return;
    setSaving(true);
    const actions = products.map((p) => ({
      productId: p.id,
      skip: true,
    }));
    try {
      const res = await fetch("/api/admin/reorder-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });
      if (!res.ok) throw new Error("Skip failed");
      setDone((d) => d + products.length);
      setMessage(`Skipped ${products.length} products`);
      void fetchBatch();
    } catch {
      setMessage("Skip failed");
    } finally {
      setSaving(false);
    }
  }, [products, fetchBatch]);

  const skipOne = useCallback(
    async (productId: string) => {
      setSaving(true);
      try {
        const res = await fetch("/api/admin/reorder-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actions: [{ productId, skip: true }],
          }),
        });
        if (!res.ok) throw new Error("Skip failed");
        setDone((d) => d + 1);
        setProducts((prev) => prev.filter((p) => p.id !== productId));
        setHeroMap((prev) => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
        setMessage("Skipped");
      } catch {
        setMessage("Skip failed");
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = total - done;

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="mx-auto h-5 w-48 rounded bg-(--color-bg-soft)" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {Array.from({ length: 50 }).map((_, i) => (
              <div key={i} className="aspect-[9/16] rounded-xl bg-(--color-bg-soft)" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[90rem] px-4 py-6">
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="font-semibold text-sm text-(--color-fg)">
              {done.toLocaleString()} / {total.toLocaleString()}
            </span>
            <span className="text-[12px] text-(--color-fg-dim)">
              {remaining > 0
                ? `${remaining.toLocaleString()} left · ${pct}%`
                : "Done!"}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-(--color-line)/40">
            <div
              className="h-full rounded-full bg-(--color-accent) transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={skipAll}
            disabled={saving || products.length === 0}
            className="rounded-full border border-(--color-line) px-4 py-1.5 text-[12px] font-medium text-(--color-fg-muted) transition hover:border-(--color-fg-dim) hover:text-(--color-fg) disabled:opacity-40"
          >
            Skip all {products.length}
          </button>
          {heroCount > 0 ? (
            <button
              type="button"
              onClick={() => void saveBatch()}
              disabled={saving}
              className="rounded-full bg-(--color-fg) px-4 py-1.5 text-[12px] font-semibold text-(--color-bg) transition hover:opacity-80 disabled:opacity-40"
            >
              Save {heroCount} selected
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className="mb-3 text-center text-[11px] text-(--color-fg-dim)">{message}</p>
      ) : null}

      {/* Product grid — 2 cols mobile, 3-4 cols desktop */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.map((p) => {
          const hero = heroMap[p.id];
          return (
            <article
              key={p.id}
              className="flex flex-col rounded-lg border border-(--color-line) bg-(--color-panel) p-1.5"
            >
              {/* Brand + Name — compact */}
              <div className="mb-1">
                {p.brand ? (
                  <p className="truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-(--color-fg-dim)">
                    {p.brand}
                  </p>
                ) : null}
                <p className="text-[11px] font-medium leading-tight text-(--color-fg) line-clamp-2">
                  {p.name}
                </p>
              </div>

              {/* Images — 2-column grid, show all */}
              <div className="grid grid-cols-2 gap-0.5">
                {p.images.map((url, idx) => {
                  const isHero = url === hero;
                  return (
                    <button
                      key={url}
                      type="button"
                      onClick={() => toggleHero(p.id, url)}
                      disabled={saving}
                      className={`relative aspect-square overflow-hidden rounded-md border transition ${
                        isHero
                          ? "border-(--color-accent) ring-1 ring-(--color-accent)/40"
                          : "border-(--color-line) hover:border-(--color-fg-dim)"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="h-full w-full object-contain p-1"
                        loading="lazy"
                      />
                      <span className="absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-fg) px-1 text-[8px] font-bold text-(--color-bg)">
                        {idx + 1}
                      </span>
                      {isHero ? (
                        <span className="absolute bottom-0 left-0 right-0 bg-(--color-accent) py-0.5 text-center text-[8px] font-semibold text-white">
                          hero
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => void skipOne(p.id)}
                disabled={saving}
                className="mt-1.5 w-full rounded-full border border-(--color-line) py-1 text-[10px] font-medium text-(--color-fg-dim) transition hover:border-(--color-fg-dim) hover:text-(--color-fg) disabled:opacity-40"
              >
                Skip
              </button>
            </article>
          );
        })}
      </div>

      {/* Bottom refresh */}
      {products.length < 50 && remaining > 0 ? (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => void fetchBatch()}
            disabled={saving}
            className="rounded-full border border-(--color-line) px-5 py-2 text-[13px] font-medium text-(--color-fg-muted) transition hover:border-(--color-fg-dim) hover:text-(--color-fg)"
          >
            Load more
          </button>
        </div>
      ) : null}
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CatalogView } from "@/components/catalog-view";
import type { ProductListItem } from "@/lib/products/queries";

type Params = {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  scored?: string;
  goal?: string;
  diet?: string;
};

export function CatalogLoader({ initialParams }: { initialParams: Params }) {
  const [products, setProducts] = useState<ProductListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/catalog");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ProductListItem[];
        if (!cancelled) setProducts(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="py-16 text-center text-sm text-(--color-bad)">
        Could not load catalog ({error}). Refresh to try again.
      </p>
    );
  }

  if (!products) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-9 max-w-md rounded-lg bg-(--color-bg-soft)" />
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-full bg-(--color-bg-soft)" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square rounded-xl bg-(--color-bg-soft)" />
              <div className="h-4 w-3/4 rounded bg-(--color-bg-soft)" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const scored = products.filter((p) => p.core_scores).length;
  return (
    <CatalogView
      products={products}
      stats={{ scored, withDetail: products.length }}
      initialParams={initialParams}
    />
  );
}

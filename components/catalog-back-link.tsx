"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { flushCatalogSnapshotForNavigation } from "@/lib/catalog/search-session";
import { catalogReturnHref } from "@/lib/products/catalog-filter";

const SESSION_KEY = "scout-catalog-return";

type CatalogParams = {
  prompt?: string;
  q?: string;
  category?: string;
  subcategory?: string;
  usecase?: string;
  brand?: string;
  scored?: string;
  labelResolved?: string;
  min?: string;
  maxprice?: string;
  grade?: string;
  sort?: string;
  goal?: string;
  diet?: string;
  sublabel?: string;
  verdict?: string;
};

export function saveCatalogReturnUrl(href: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, href);
    flushCatalogSnapshotForNavigation(href);
  } catch {
    /* ignore */
  }
}

export function CatalogBackLink({ params }: { params: CatalogParams }) {
  const fromParams = catalogReturnHref(params);
  const [href, setHref] = useState(fromParams);

  useEffect(() => {
    setHref(fromParams);
    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved?.startsWith("/search")) setHref(saved);
    } catch {
      /* ignore */
    }
  }, [fromParams]);

  return (
    <Link href={href} className="text-sm text-(--color-fg-muted) hover:text-(--color-fg)">
      ← Catalog
    </Link>
  );
}

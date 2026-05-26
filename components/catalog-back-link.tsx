"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { catalogReturnHref } from "@/lib/products/catalog-filter";

const SESSION_KEY = "scout-catalog-return";

type CatalogParams = {
  q?: string;
  category?: string;
  subcategory?: string;
  usecase?: string;
  brand?: string;
  scored?: string;
  min?: string;
  maxprice?: string;
  grade?: string;
  sort?: string;
  goal?: string;
  diet?: string;
};

export function saveCatalogReturnUrl(href: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, href);
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

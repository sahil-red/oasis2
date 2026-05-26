"use client";

import { CatalogView } from "@/components/catalog-view";
import type { CatalogMetaResponse } from "@/lib/products/catalog-api";

type Params = {
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

export function CatalogLoader({
  initialParams,
  initialMeta,
}: {
  initialParams: Params;
  initialMeta?: CatalogMetaResponse;
}) {
  return <CatalogView initialParams={initialParams} initialMeta={initialMeta} />;
}

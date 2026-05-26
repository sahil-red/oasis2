"use client";

import { CatalogView } from "@/components/catalog-view";
import type { CatalogMetaResponse } from "@/lib/products/catalog-api";
import type { CatalogSearchResult } from "@/lib/products/queries";

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
  initialSearch,
}: {
  initialParams: Params;
  initialMeta?: CatalogMetaResponse;
  initialSearch?: CatalogSearchResult;
}) {
  return (
    <CatalogView
      initialParams={initialParams}
      initialMeta={initialMeta}
      initialSearch={initialSearch}
    />
  );
}

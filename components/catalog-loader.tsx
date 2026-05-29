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

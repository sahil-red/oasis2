"use client";

import { CatalogView } from "@/components/catalog-view";

type Params = {
  q?: string;
  category?: string;
  subcategory?: string;
  usecase?: string;
  brand?: string;
  scored?: string;
  goal?: string;
  diet?: string;
};

export function CatalogLoader({ initialParams }: { initialParams: Params }) {
  return <CatalogView initialParams={initialParams} />;
}

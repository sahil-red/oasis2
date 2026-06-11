import type { Metadata } from "next";
import { CatalogLoader } from "@/components/catalog-loader";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import {
  getCachedCatalogMeta,
  getCachedCatalogSearch,
} from "@/lib/products/catalog-cache";

export const metadata: Metadata = {
  title: "Ask Scout — search the catalog · Scout",
  description:
    "Ask for what you actually need — low-sugar biscuits, high-protein snacks under ₹200 — and get answers scored from the back label.",
};

type SearchParams = {
  prompt?: string;
  q?: string;
  category?: string;
  subcategory?: string;
  usecase?: string;
  brand?: string;
  scored?: string;
  labelResolved?: string;
  deepseek?: string;
  min?: string;
  maxprice?: string;
  grade?: string;
  sort?: string;
  goal?: string;
  diet?: string;
  sublabel?: string;
  verdict?: string;
};

/** Shell renders immediately; catalog JSON loads client-side from cached API. */
export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [meta, initialSearch] = await Promise.all([
    getCachedCatalogMeta(params.category).catch(() => undefined),
    getCachedCatalogSearch({ ...params, page: 1, limit: 96 }).catch(() => undefined),
  ]);

  return (
    <main className="min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-3 md:px-6 md:pt-4">
        <CatalogLoader initialParams={params} initialMeta={meta} initialSearch={initialSearch} />
      </div>

      <SiteFooter />
    </main>
  );
}

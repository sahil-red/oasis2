import { CatalogLoader } from "@/components/catalog-loader";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import {
  getCachedCatalogMeta,
  getCachedCatalogSearch,
} from "@/lib/products/catalog-cache";

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
    getCachedCatalogMeta(params.category),
    getCachedCatalogSearch({ ...params, page: 1, limit: 96 }),
  ]);

  return (
    <main className="min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-8 md:px-6 md:pt-10">
        <CatalogLoader initialParams={params} initialMeta={meta} initialSearch={initialSearch} />
      </div>

      <SiteFooter />
    </main>
  );
}

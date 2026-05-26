import { CatalogLoader } from "@/components/catalog-loader";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import {
  getCachedCatalogMeta,
  getCachedCatalogSearch,
} from "@/lib/products/catalog-cache";

type SearchParams = {
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
        <header className="mb-10 max-w-xl">
          <h1 className="font-display text-4xl leading-tight tracking-tight md:text-[2.75rem]">
            Catalog
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-(--color-fg-muted)">
            Instant search — filter by aisle, brand, or goal mode as you type.
          </p>
        </header>

        <CatalogLoader initialParams={params} initialMeta={meta} initialSearch={initialSearch} />
      </div>

      <SiteFooter />
    </main>
  );
}

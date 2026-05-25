import { CatalogFiltersBar } from "@/components/catalog-filters";
import { ProductCard } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import {
  countCatalog,
  getCatalogFilters,
  searchProducts,
} from "@/lib/products/queries";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  scored?: string;
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const onlyScored = params.scored === "1";

  const filterOptions = await getCatalogFilters(params.category);
  let products = await searchProducts({
    q: params.q?.trim() || undefined,
    category: params.category || undefined,
    subcategory: params.subcategory || undefined,
    brand: params.brand || undefined,
    limit: 120,
    onlyWithDetail: true,
    onlyScored,
  });

  const stats = await countCatalog().catch(() => ({
    total: 0,
    withDetail: 0,
    scored: 0,
  }));

  return (
    <main className="min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl leading-tight md:text-5xl">Catalog</h1>
          <p className="mt-3 text-(--color-fg-muted)">
            {stats.scored} scored · {stats.withDetail} with full labels · filter by aisle,
            brand, or name. Each card shows the same quick analysis tags as the homepage
            sample.
          </p>
        </div>

        <div className="mt-8">
          <CatalogFiltersBar
            filters={filterOptions}
            params={params}
            resultCount={products.length}
          />
        </div>

        {products.length === 0 ? (
          <div className="panel mt-12 rounded-2xl px-6 py-16 text-center">
            <p className="text-(--color-fg-muted)">No products match these filters.</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>

      <SiteFooter />
    </main>
  );
}

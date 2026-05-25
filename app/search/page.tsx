import { CatalogView } from "@/components/catalog-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { countCatalog, getAllCatalogProducts } from "@/lib/products/queries";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  scored?: string;
  goal?: string;
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const [products, stats] = await Promise.all([
    getAllCatalogProducts({ onlyWithDetail: true }),
    countCatalog().catch(() => ({ total: 0, withDetail: 0, scored: 0 })),
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
            Instant search across scored groceries — filter by aisle or brand as you type.
          </p>
        </header>

        <CatalogView
          products={products}
          stats={{ scored: stats.scored, withDetail: stats.withDetail }}
          initialParams={params}
        />
      </div>

      <SiteFooter />
    </main>
  );
}

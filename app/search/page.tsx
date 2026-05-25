import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { ProductCard } from "@/components/product-card";
import { Section, Eyebrow, H2 } from "@/components/section";
import { countCatalog, searchProducts } from "@/lib/products/queries";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; scored?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const onlyScored = params.scored === "1";

  let products = await searchProducts({
    q: q || undefined,
    limit: 96,
    onlyWithDetail: true,
  });

  if (onlyScored) {
    products = products.filter((p) => p.core_scores != null);
  }

  const stats = await countCatalog().catch(() => ({
    total: 0,
    withDetail: 0,
    scored: 0,
  }));

  return (
    <main>
      <SiteNav />
      <Section className="pb-16 pt-12">
        <Eyebrow>Catalog</Eyebrow>
        <H2>Browse scored products.</H2>
        <p className="mt-4 max-w-2xl text-(--color-fg-muted)">
          {stats.scored} products with Core scores · {stats.withDetail} with full PDP data ·{" "}
          {stats.total} total in database. Scraping continues in the background.
        </p>

        <form className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center" action="/search">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by product name…"
            className="w-full max-w-xl rounded-full border border-(--color-line) bg-(--color-panel) px-5 py-3 text-sm text-(--color-fg) outline-none placeholder:text-(--color-fg-dim) focus:border-(--color-line-strong)"
          />
          <label className="flex items-center gap-2 text-sm text-(--color-fg-muted)">
            <input
              type="checkbox"
              name="scored"
              value="1"
              defaultChecked={onlyScored}
              className="rounded border-(--color-line)"
            />
            Scored only
          </label>
          <button
            type="submit"
            className="rounded-full bg-(--color-fg) px-6 py-3 text-sm font-medium text-(--color-bg) hover:opacity-90"
          >
            Search
          </button>
        </form>

        {products.length === 0 ? (
          <p className="mt-16 text-(--color-fg-muted)">
            No products match. Try clearing filters or run scoring after OCR completes.
          </p>
        ) : (
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}

        <Link
          href="/"
          className="mt-16 inline-flex items-center gap-2 text-sm text-(--color-fg-muted) hover:text-(--color-fg)"
        >
          ← Back home
        </Link>
      </Section>
    </main>
  );
}

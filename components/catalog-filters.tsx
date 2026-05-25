import Link from "next/link";
import type { CatalogFilters } from "@/lib/products/queries";

type Params = {
  q?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  scored?: string;
};

const selectClass =
  "w-full min-w-0 appearance-none rounded-lg border border-(--color-line) bg-(--color-bg-soft) px-3 py-2.5 text-sm text-(--color-fg) outline-none focus:border-(--color-line-strong)";

export function CatalogFiltersBar({
  filters,
  params,
  resultCount,
}: {
  filters: CatalogFilters;
  params: Params;
  resultCount: number;
}) {
  const hasFilters = Boolean(
    params.q || params.category || params.subcategory || params.brand || params.scored,
  );

  return (
    <div className="panel space-y-4 rounded-2xl p-4 md:p-5">
      <form action="/search" method="get" className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1 space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-(--color-fg-dim)">
              Search
            </span>
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Product name…"
              className={selectClass}
            />
          </label>
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-(--color-fg) px-6 py-2.5 text-sm font-medium text-(--color-bg) hover:opacity-90 lg:mb-0"
          >
            Apply
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-(--color-fg-dim)">
              Category
            </span>
            <select name="category" defaultValue={params.category ?? ""} className={selectClass}>
              <option value="">All categories</option>
              {filters.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-(--color-fg-dim)">
              Subcategory
            </span>
            <select name="subcategory" defaultValue={params.subcategory ?? ""} className={selectClass}>
              <option value="">All subcategories</option>
              {filters.subcategories.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-(--color-fg-dim)">
              Brand
            </span>
            <select name="brand" defaultValue={params.brand ?? ""} className={selectClass}>
              <option value="">All brands</option>
              {filters.brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--color-line) pt-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-(--color-fg-muted)">
            <input
              type="checkbox"
              name="scored"
              value="1"
              defaultChecked={params.scored === "1"}
              className="rounded border-(--color-line)"
            />
            Scored products only
          </label>
          <p className="text-sm text-(--color-fg-dim)">
            <span className="tabular-nums text-(--color-fg)">{resultCount}</span> results
          </p>
        </div>
      </form>

      {hasFilters ? (
        <Link
          href="/search"
          className="inline-block text-sm text-(--color-fg-muted) underline-offset-4 hover:text-(--color-fg) hover:underline"
        >
          Clear all filters
        </Link>
      ) : null}
    </div>
  );
}

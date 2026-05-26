import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-(--color-line)">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-14 md:flex-row md:items-start md:justify-between">
        <div>
          <Link href="/" className="font-display text-xl text-(--color-fg)">
            Scout
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-(--color-fg-muted)">
            Independent ingredient research for Indian packaged groceries.
          </p>
        </div>
        <div className="flex gap-12 text-sm">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-(--color-fg-dim)">Product</p>
            <Link href="/search" className="block text-(--color-fg-muted) hover:text-(--color-fg)">
              Catalog
            </Link>
            <Link href="/#how-it-works" className="block text-(--color-fg-muted) hover:text-(--color-fg)">
              Method
            </Link>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-(--color-fg-dim)">Data</p>
            <a
              href="https://world.openfoodfacts.org/"
              target="_blank"
              rel="noreferrer"
              className="block text-(--color-fg-muted) hover:text-(--color-fg)"
            >
              Open Food Facts
            </a>
          </div>
        </div>
      </div>
      <div className="hairline mx-auto max-w-6xl" />
      <p className="mx-auto max-w-6xl px-6 py-6 text-xs text-(--color-fg-dim)">
        © {new Date().getFullYear()} Scout
      </p>
    </footer>
  );
}

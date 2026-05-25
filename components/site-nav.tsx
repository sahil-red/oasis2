import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NavCartLink } from "@/components/nav-cart-link";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-(--color-line) bg-white/90 backdrop-blur-md">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-(--color-fg) font-display text-base text-(--color-bg)">
            o
          </span>
          <span className="font-display text-lg text-(--color-fg)">Oasis</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm text-(--color-fg-muted) md:flex">
          <Link href="/search" className="hover:text-(--color-fg)">
            Catalog
          </Link>
          <Link
            href="/search"
            className="hover:text-(--color-fg)"
            title="Pick a goal mode on the catalog — rankings and swaps adapt"
          >
            Goals
          </Link>
          <NavCartLink className="inline-flex items-center hover:text-(--color-fg)" />
          <Link href="/insights" className="hover:text-(--color-fg)">
            Insights
          </Link>
        </div>
        <Link
          href="/search"
          className="inline-flex items-center gap-1.5 rounded-lg bg-(--color-fg) px-4 py-2 text-sm font-medium text-(--color-bg) hover:opacity-90"
        >
          Browse
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </nav>
    </header>
  );
}

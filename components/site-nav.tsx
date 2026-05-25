import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-(--color-line) bg-(--color-bg)/85 backdrop-blur-md">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-(--color-fg) font-display text-base text-(--color-bg)">
            o
          </span>
          <span className="font-display text-lg text-(--color-fg)">Oasis</span>
        </Link>
        <div className="hidden items-center gap-8 text-sm text-(--color-fg-muted) md:flex">
          <Link href="/search" className="hover:text-(--color-fg)">
            Catalog
          </Link>
          <Link href="/#how-it-works" className="hover:text-(--color-fg)">
            Method
          </Link>
          <Link href="/#faq" className="hover:text-(--color-fg)">
            FAQ
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

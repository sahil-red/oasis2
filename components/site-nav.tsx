import Link from "next/link";
import { NavCartLink } from "@/components/nav-cart-link";
import { ThemeToggle } from "@/components/theme-toggle";

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-(--color-line) bg-(--color-panel)/90 backdrop-blur-md">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-(--color-fg) font-display text-base text-(--color-bg)">
            S
          </span>
          <span className="font-display text-lg text-(--color-fg)">Scout</span>
        </Link>
        <div className="hidden items-center gap-6 text-sm text-(--color-fg-muted) md:flex">
          <Link href="/search" className="hover:text-(--color-fg)">
            Catalog
          </Link>
          <NavCartLink className="inline-flex items-center hover:text-(--color-fg)" />
          <Link href="/insights" className="hover:text-(--color-fg)">
            Insights
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

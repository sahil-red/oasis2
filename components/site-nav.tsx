import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function SiteNav() {
  return (
    <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-7">
      <Link href="/" className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-(--color-fg) font-display text-base text-(--color-bg)">
          o
        </div>
        <span className="font-display text-xl">Oasis</span>
      </Link>
      <div className="hidden items-center gap-7 text-sm text-(--color-fg-muted) md:flex">
        <Link href="/search" className="hover:text-(--color-fg)">
          Search
        </Link>
        <Link href="/#how-it-works" className="hover:text-(--color-fg)">
          How it works
        </Link>
        <Link href="/#faq" className="hover:text-(--color-fg)">
          FAQ
        </Link>
        <Link href="/blog" className="hover:text-(--color-fg)">
          Research
        </Link>
      </div>
      <Link
        href="/search"
        className="inline-flex items-center gap-1.5 rounded-full border border-(--color-line) px-4 py-2 text-sm text-(--color-fg) hover:border-(--color-line-strong)"
      >
        Browse <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </nav>
  );
}

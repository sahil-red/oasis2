import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-(--color-line)">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-14 md:flex-row md:items-start md:justify-between">
        <div className="max-w-md">
          <Link href="/" className="font-display text-2xl text-(--color-fg)">
            Scout
          </Link>
          <p className="mt-3 text-[14px] leading-relaxed text-(--color-fg-muted)">
            We read the back label so you don&apos;t have to. Honest grocery
            intel for India — verdicts, swaps, and what to skip.
          </p>
          <p className="mt-3 text-[12px] italic leading-relaxed text-(--color-fg-dim)">
            We don&apos;t test food in a lab. We read what&apos;s printed on the
            pack and call it like we see it.
          </p>
        </div>
        <div className="flex gap-12 text-sm">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-(--color-fg-dim)">
              Browse
            </p>
            <Link href="/search?verdict=daily_staple" className="block text-(--color-fg-muted) hover:text-(--color-fg)">
              Daily staples
            </Link>
            <Link href="/search?verdict=skip" className="block text-(--color-fg-muted) hover:text-(--color-fg)">
              Skip list
            </Link>
            <Link href="/insights" className="block text-(--color-fg-muted) hover:text-(--color-fg)">
              Insights
            </Link>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-(--color-fg-dim)">
              You
            </p>
            <Link href="/basket" className="block text-(--color-fg-muted) hover:text-(--color-fg)">
              Your basket
            </Link>
            <Link href="/search" className="block text-(--color-fg-muted) hover:text-(--color-fg)">
              Set a goal
            </Link>
          </div>
        </div>
      </div>
      <div className="hairline mx-auto max-w-6xl" />
      <p className="mx-auto max-w-6xl px-6 py-6 text-xs text-(--color-fg-dim)">
        © {new Date().getFullYear()} Scout · Independent. Opinionated. Built in India.
      </p>
    </footer>
  );
}

import { SiteNav } from "@/components/site-nav";

/** Instant skeleton while the PDP server-renders — clicking a card must never feel dead. */
export default function ProductLoading() {
  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-6">
        <div className="h-4 w-24 animate-pulse rounded bg-(--color-bg-soft)" />
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
          {/* Gallery */}
          <div className="space-y-5">
            <div className="aspect-square animate-pulse rounded-2xl bg-(--color-bg-soft)" />
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 w-14 animate-pulse rounded-lg bg-(--color-bg-soft)" />
              ))}
            </div>
          </div>
          {/* Meta */}
          <div className="space-y-4">
            <div className="h-3 w-28 animate-pulse rounded bg-(--color-bg-soft)" />
            <div className="h-9 w-4/5 animate-pulse rounded bg-(--color-bg-soft)" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-(--color-bg-soft)" />
            <div className="h-8 w-24 animate-pulse rounded bg-(--color-bg-soft)" />
            <div className="flex gap-3 pt-2">
              <div className="h-11 w-32 animate-pulse rounded-xl bg-(--color-bg-soft)" />
              <div className="h-11 w-32 animate-pulse rounded-xl bg-(--color-bg-soft)" />
            </div>
            <div className="h-28 animate-pulse rounded-2xl bg-(--color-bg-soft)" />
            <div className="h-44 animate-pulse rounded-2xl bg-(--color-bg-soft)" />
          </div>
        </div>
      </div>
    </main>
  );
}

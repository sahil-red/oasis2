import { SiteNav } from "@/components/site-nav";

/** Instant shell while the search page server-renders. */
export default function SearchLoading() {
  return (
    <main className="min-h-screen">
      <SiteNav />
      <div className="mx-auto max-w-7xl px-5 pb-20 pt-8 md:px-6">
        <div className="h-8 w-40 animate-pulse rounded bg-(--color-bg-soft)" />
        <div className="mt-4 flex gap-2">
          <div className="h-12 flex-1 animate-pulse rounded-2xl bg-(--color-bg-soft)" />
          <div className="h-12 w-28 animate-pulse rounded-2xl bg-(--color-bg-soft)" />
        </div>
        <div className="mt-3 flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-7 w-28 animate-pulse rounded-full bg-(--color-bg-soft)" />
          ))}
        </div>
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square animate-pulse rounded-2xl bg-(--color-bg-soft)" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-(--color-bg-soft)" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-(--color-bg-soft)" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

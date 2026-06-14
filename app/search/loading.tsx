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
        <div className="mt-8 grid grid-cols-2 items-stretch gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-x-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex h-full animate-pulse flex-col">
              <div className="aspect-[3/4] rounded-2xl bg-(--color-bg-soft)" />
              <div className="mt-3 space-y-2 px-1">
                <div className="h-2 w-1/3 rounded bg-(--color-bg-soft)" />
                <div className="h-3.5 w-5/6 rounded bg-(--color-bg-soft)" />
                <div className="h-3.5 w-2/3 rounded bg-(--color-bg-soft)" />
                <div className="mt-1 h-4 w-1/4 rounded bg-(--color-bg-soft)" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

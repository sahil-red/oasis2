import { BasketView } from "@/components/basket-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export default function BasketPage() {
  return (
    <main className="min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-3xl px-5 pb-20 pt-8 md:px-6 md:pt-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl leading-tight md:text-4xl">Your cart</h1>
            <p className="mt-1.5 text-sm text-(--color-fg-muted)">
              Saved locally · scores and swaps update as you shop
            </p>
          </div>
        </header>

        <div className="mt-8">
          <BasketView />
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}

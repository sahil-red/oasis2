import { BasketView } from "@/components/basket-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export default function BasketPage() {
  return (
    <main className="min-h-screen">
      <SiteNav />

      <div className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <header className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.18em] text-(--color-fg-dim)">Your basket</p>
          <h1 className="mt-2 font-display text-4xl leading-tight">Cart intelligence</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-(--color-fg-muted)">
            A living snapshot of your cart — macro balance, sugar load, and scores. Add from the
            catalog with <span className="font-medium text-(--color-fg)">+</span>; everything stays
            in your browser.
          </p>
        </header>

        <div className="mt-10">
          <BasketView />
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}

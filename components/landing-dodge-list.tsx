import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ProductListItem } from "@/lib/products/queries";

export type DodgeProduct = {
  slug: string;
  name: string;
  brand: string | null;
  image: string | null;
  score: number;
  claim: string;
  reality: string;
};

function DodgeCard({ product }: { product: DodgeProduct }) {
  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex flex-col rounded-2xl border bg-(--color-panel) p-4 transition"
      style={{ borderColor: "color-mix(in srgb, var(--color-bad) 24%, transparent)" }}
    >
      <div className="flex items-start gap-3">
        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-(--color-bg-soft)">
          {product.image ? (
            <Image src={product.image} alt={product.name} fill sizes="48px" className="object-contain p-1" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          {product.brand && (
            <p className="truncate text-[10px] uppercase tracking-wider text-(--color-fg-dim)">{product.brand}</p>
          )}
          <p className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug text-(--color-fg) group-hover:text-(--color-accent)">
            {product.name}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <span className="block text-lg font-bold tabular-nums text-(--color-bad)">{product.score}</span>
          <span className="text-[9px] text-(--color-fg-dim)">score</span>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-(--color-good)"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-good) 10%, transparent)" }}
          >
            Claims
          </span>
          <p className="text-[12px] text-(--color-fg-muted)">{product.claim}</p>
        </div>
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-(--color-bad)"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-bad) 10%, transparent)" }}
          >
            Reality
          </span>
          <p className="text-[12px] text-(--color-fg-muted)">{product.reality}</p>
        </div>
      </div>
    </Link>
  );
}

export function LandingDodgeList({ products }: { products: DodgeProduct[] }) {
  if (!products.length) return null;

  return (
    <section className="border-b border-(--color-line) bg-(--color-bg-soft)">
      <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-bad)">Scout warning</p>
            <h2 className="font-display mt-3 text-3xl leading-tight md:text-[2.5rem]">
              The marketing's a lie.
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-(--color-fg-muted)">
              Products that sell hard on health claims but score poorly on the back label.
            </p>
          </div>
          <Link
            href="/search?verdict=skip&sort=score-asc"
            className="hidden items-center gap-1.5 text-sm font-medium text-(--color-fg-muted) hover:text-(--color-fg) md:inline-flex"
          >
            Full skip list <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <DodgeCard key={p.slug} product={p} />
          ))}
        </div>

        <Link
          href="/search?verdict=skip&sort=score-asc"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-(--color-fg-muted) hover:text-(--color-fg) md:hidden"
        >
          Full skip list <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

const HEALTH_CLAIMS_RE =
  /\b(healthy|protein|zero|diet|lite|light|natural|nutri|wellness|immunity|digestive|sugar.?free|no.?added.?sugar|high.?fiber|organic|whole.?grain|multigrain|fortified|enriched|probiotic)\b/i;

export function buildDodgeList(products: ProductListItem[]): DodgeProduct[] {
  const scored = products.filter((p) => p.core_scores);
  const healthClaims = scored.filter(
    (p) =>
      HEALTH_CLAIMS_RE.test(`${p.name} ${(p.core_scores?.verdict_sublabels as string[] | undefined)?.join(" ") ?? ""}`) &&
      (p.core_scores?.score ?? 100) < 45,
  );

  return healthClaims
    .sort((a, b) => (a.core_scores?.score ?? 0) - (b.core_scores?.score ?? 0))
    .slice(0, 6)
    .map((p) => {
      const score = p.core_scores?.score ?? 0;
      const sublabels = (p.core_scores?.verdict_sublabels as string[] | undefined) ?? [];

      // Build claim from name keywords
      let claim = "Markets as healthy";
      if (/no.?added.?sugar|zero.?sugar/i.test(p.name)) claim = "No added sugar";
      else if (/high.?protein|protein.?rich/i.test(p.name)) claim = "High protein";
      else if (/organic/i.test(p.name)) claim = "Organic & natural";
      else if (/multigrain|whole.?grain/i.test(p.name)) claim = "Multigrain / whole grain";
      else if (/sugar.?free/i.test(p.name)) claim = "Sugar free";
      else if (/natural/i.test(p.name)) claim = "100% natural";
      else if (/diet|lite|light/i.test(p.name)) claim = "Diet / light option";

      // Build reality from sublabels and score
      const realities: string[] = [];
      if (sublabels.includes("hidden_sweetener")) realities.push("hidden sweeteners on label");
      if (sublabels.includes("ultra_processed")) realities.push("ultra-processed (NOVA 4)");
      if (sublabels.includes("high_sugar")) realities.push("high in sugar");
      if (sublabels.includes("artificial_colors")) realities.push("artificial colours");
      if (sublabels.includes("artificial_flavors")) realities.push("artificial flavours");
      if (!realities.length) realities.push(`Scout score only ${score}/100`);

      return {
        slug: p.slug,
        name: p.name,
        brand: p.brand ?? null,
        image: p.image_urls?.[0] ?? null,
        score,
        claim,
        reality: realities.join(", "),
      };
    });
}

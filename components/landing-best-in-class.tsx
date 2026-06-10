import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ProductListItem } from "@/lib/products/queries";
import { colorForGrade } from "@/lib/utils";

type BestInClassCategory = {
  label: string;
  href: string;
  products: ProductListItem[];
  avgScore: number;
  skipPct: number;
};

function MiniCard({ product }: { product: ProductListItem }) {
  const score = product.core_scores?.score;
  const grade = product.core_scores?.grade;
  const thumb = product.image_urls?.[0];
  const protein = product.nutrition?.protein_g_100g;
  const sugar = product.nutrition?.sugar_g_100g ?? product.nutrition?.added_sugar_g_100g;

  return (
    <Link
      href={`/product/${product.slug}`}
      className="group flex items-center gap-3 rounded-xl border border-(--color-line) bg-(--color-bg) p-2.5 transition hover:border-(--color-fg-muted)"
    >
      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-(--color-bg-soft)">
        {thumb ? (
          <Image src={thumb} alt={product.name} fill sizes="40px" className="object-contain p-0.5" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium leading-snug text-(--color-fg) group-hover:text-(--color-accent)">
          {product.name}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-(--color-fg-dim)">
          {grade && (
            <span className="font-bold" style={{ color: colorForGrade(grade) }}>
              {grade}
            </span>
          )}
          {score != null && <span>{score}/100</span>}
          {protein != null && <span>· {Math.round(protein)}g P</span>}
          {sugar != null && <span>· {sugar.toFixed(1)}g S</span>}
        </div>
      </div>
    </Link>
  );
}

export function LandingBestInClass({ categories }: { categories: BestInClassCategory[] }) {
  if (!categories.length) return null;

  return (
    <section className="border-b border-(--color-line)">
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        <div className="mb-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">Best in class</p>
          <h2 className="font-display mt-3 text-3xl leading-tight md:text-[2.5rem]">
            Top picks in every aisle.
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-(--color-fg-muted)">
            The actual best products Scout has scored in each category — ranked by health score, not sales.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <div key={cat.label} className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-(--color-fg)">{cat.label}</p>
                  <div className="mt-0.5 flex gap-3 text-[11px] text-(--color-fg-dim)">
                    <span>Avg score <span className="font-medium text-(--color-fg)">{cat.avgScore}</span></span>
                    <span>·</span>
                    <span className="text-(--color-bad)">{cat.skipPct}% skip-worthy</span>
                  </div>
                </div>
                <Link
                  href={cat.href}
                  className="flex items-center gap-0.5 text-[11px] text-(--color-fg-dim) hover:text-(--color-fg)"
                >
                  All <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="space-y-2">
                {cat.products.slice(0, 3).map((p) => (
                  <MiniCard key={p.id} product={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function buildBestInClass(
  products: ProductListItem[],
  categories: string[],
): BestInClassCategory[] {
  const scored = products.filter((p) => p.core_scores);
  return categories
    .map((cat) => {
      const inCat = scored.filter((p) => p.category === cat);
      if (inCat.length < 3) return null;
      const top = [...inCat].sort((a, b) => (b.core_scores?.score ?? 0) - (a.core_scores?.score ?? 0)).slice(0, 3);
      const avgScore = Math.round(inCat.reduce((s, p) => s + (p.core_scores?.score ?? 0), 0) / inCat.length);
      const skipCount = inCat.filter((p) => p.core_scores?.verdict === "skip").length;
      const skipPct = Math.round((skipCount / inCat.length) * 100);
      return {
        label: cat,
        href: `/search?category=${encodeURIComponent(cat)}&verdict=daily_staple`,
        products: top,
        avgScore,
        skipPct,
      };
    })
    .filter((x): x is BestInClassCategory => x != null)
    .slice(0, 6);
}

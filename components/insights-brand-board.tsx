import { colorForScore } from "@/lib/utils";
import type { BrandStat } from "@/lib/products/insights";

function BrandRow({
  brand,
  rank,
  stat,
}: {
  brand: BrandStat;
  rank: number;
  stat: string;
}) {
  const pct = Math.min(100, brand.avgScore);
  const barColor = colorForScore(brand.avgScore);
  return (
    <li className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-medium text-(--color-fg)">
          <span className="text-(--color-fg-dim)">{rank}. </span>
          {brand.brand}
        </span>
        <span className="font-display text-xl tabular-nums" style={{ color: barColor }}>
          {brand.avgScore.toFixed(0)}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-(--color-bg-soft)">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="mt-2 text-[13px] text-(--color-fg-muted)">{stat}</p>
    </li>
  );
}

export function InsightsBrandBoard({
  cleanest,
  weakest,
}: {
  cleanest: BrandStat[];
  weakest: BrandStat[];
}) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="rounded-2xl border border-(--color-good)/30 bg-(--color-panel) p-5 sm:p-6">
        <h2 className="font-display text-xl text-(--color-fg)">Cleanest brands</h2>
        <p className="mt-1 text-sm text-(--color-fg-muted)">
          Highest average scores · at least 3 products in our catalog.
        </p>
        <ol className="mt-4 space-y-3">
          {cleanest.map((b, i) => (
            <BrandRow
              key={b.brand}
              brand={b}
              rank={i + 1}
              stat={`${b.count} items · ${b.avgSugar != null ? `~${b.avgSugar.toFixed(0)}g sugar avg` : "label data"}`}
            />
          ))}
        </ol>
      </section>
      <section className="rounded-2xl border border-(--color-bad)/30 bg-(--color-panel) p-5 sm:p-6">
        <h2 className="font-display text-xl text-(--color-fg)">Weakest averages</h2>
        <p className="mt-1 text-sm text-(--color-fg-muted)">
          Brands that consistently score low on labels we have.
        </p>
        <ol className="mt-4 space-y-3">
          {weakest.map((b, i) => (
            <BrandRow
              key={b.brand}
              brand={b}
              rank={i + 1}
              stat={`${b.count} items · worth checking alternatives`}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import { ScoreBadge } from "@/components/score-display";
import { cn, colorForScore } from "@/lib/utils";
import type { ProductListItem } from "@/lib/products/queries";

export function InsightProductCard({
  product,
  headline,
  subline,
  badge,
  accent = "default",
}: {
  product: ProductListItem;
  headline: string;
  subline?: string;
  badge?: string;
  accent?: "default" | "warn" | "value" | "snack";
}) {
  const accentBorder =
    accent === "warn"
      ? "border-(--color-warn)/30 bg-(--color-panel)"
      : accent === "value"
        ? "border-(--color-good)/30 bg-(--color-panel)"
        : accent === "snack"
          ? "border-(--color-accent)/30 bg-(--color-panel)"
          : "border-(--color-line) bg-(--color-panel)";

  return (
    <Link
      href={`/product/${product.slug}`}
      className={cn(
        "u-lift group flex h-full flex-col overflow-hidden rounded-2xl border shadow-sm",
        accentBorder,
      )}
    >
      <div className="relative aspect-[4/3] bg-(--color-bg-soft)">
        {product.image_urls[0] ? (
          <Image
            src={product.image_urls[0]}
            alt={product.name}
            fill
            className="object-contain p-3 transition duration-300 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 50vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-(--color-fg-dim)">
            No image
          </div>
        )}
        {product.core_scores ? (
          <div className="absolute right-2 top-2 rounded-lg bg-(--color-panel)/95 px-1.5 py-0.5 shadow-sm">
            <ScoreBadge
              score={product.core_scores.score}
              grade={product.core_scores.grade}
              className="!text-2xl"
            />
          </div>
        ) : null}
        {badge ? (
          <span className="absolute bottom-2 left-2 rounded-full bg-(--color-fg) px-2.5 py-1 text-[11px] font-medium text-(--color-bg)">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {product.brand ? (
          <p className="text-[11px] uppercase tracking-wider text-(--color-fg-dim)">
            {product.brand}
          </p>
        ) : null}
        <h3 className="mt-1 line-clamp-2 text-[15px] font-medium leading-snug text-(--color-fg) group-hover:text-(--color-accent)">
          {product.name}
        </h3>
        <p className="mt-2 flex-1 text-[14px] leading-relaxed text-(--color-fg-muted)">
          {headline}
        </p>
        {subline ? (
          <p className="mt-2 text-[13px] leading-snug text-(--color-fg-dim)">{subline}</p>
        ) : null}
        {product.price_inr != null ? (
          <p className="mt-3 text-[15px] font-semibold tabular-nums text-(--color-fg)">
            ₹{product.price_inr}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function InsightFeaturedCard({
  product,
  callout,
}: {
  product: ProductListItem;
  callout: { claim: string; reality: string };
}) {
  const score = product.core_scores?.score ?? 0;
  return (
    <Link
      href={`/product/${product.slug}`}
      className="u-lift group grid overflow-hidden rounded-2xl border border-(--color-warn)/30 bg-(--color-panel) shadow-sm md:grid-cols-[minmax(0,220px)_1fr]"
    >
      <div className="relative aspect-square bg-(--color-panel) md:aspect-auto md:min-h-[220px]">
        {product.image_urls[0] ? (
          <Image
            src={product.image_urls[0]}
            alt={product.name}
            fill
            className="object-contain p-4"
          />
        ) : null}
      </div>
      <div className="flex flex-col justify-center p-6 md:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-(--color-warn)">
          Marketing reality check
        </p>
        <h2 className="mt-2 font-display text-2xl leading-tight text-(--color-fg) group-hover:text-(--color-accent)">
          {product.name}
        </h2>
        <div className="mt-4 space-y-3">
          <div className="rounded-lg bg-(--color-accent-soft) px-3 py-2 ring-1 ring-(--color-line-strong)">
            <p className="text-[13px] font-medium text-(--color-fg)">Claim</p>
            <p className="text-[15px] text-(--color-fg)">{callout.claim}</p>
          </div>
          <div className="rounded-lg bg-(--color-accent-soft) px-3 py-2 ring-1 ring-(--color-line-strong)">
            <p className="text-[13px] font-medium text-(--color-fg)">Reality</p>
            <p className="text-[15px] leading-relaxed text-(--color-fg-muted)">
              {callout.reality}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm font-medium" style={{ color: colorForScore(score) }}>
          Overall score {score} — see swaps on the product page →
        </p>
      </div>
    </Link>
  );
}

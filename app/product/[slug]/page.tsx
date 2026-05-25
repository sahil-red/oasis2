import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { ScoreRing } from "@/components/score-ring";
import { SubscoreBars } from "@/components/subscore-bars";
import { NutritionTable } from "@/components/nutrition-table";
import { IngredientPanel } from "@/components/ingredient-panel";
import { Section } from "@/components/section";
import { getProductBySlug } from "@/lib/products/queries";
import { labelForBand } from "@/lib/utils";
import type { SubScores } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const DETAIL_SKIP = new Set([
  "Description",
  "Key Features",
  "Disclaimer",
  "Return Policy",
  "Customer Care Details",
]);

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const score = product.core_scores;
  const attrs = product.attributes ?? {};
  const attrEntries = Object.entries(attrs).filter(([k]) => !DETAIL_SKIP.has(k));
  const subscores = score?.subscores as SubScores | undefined;

  return (
    <main>
      <SiteNav />
      <Section className="pb-24 pt-10">
        <Link
          href="/search"
          className="text-sm text-(--color-fg-muted) hover:text-(--color-fg)"
        >
          ← Back to catalog
        </Link>

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <div className="relative aspect-square overflow-hidden rounded-2xl border border-(--color-line) bg-(--color-panel)">
              {product.image_urls[0] ? (
                <Image
                  src={product.image_urls[0]}
                  alt={product.name}
                  fill
                  className="object-contain p-8"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                  unoptimized
                />
              ) : null}
            </div>
            {product.image_urls.length > 1 ? (
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                {product.image_urls.slice(0, 6).map((url, i) => (
                  <div
                    key={url}
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-(--color-line) bg-(--color-panel)"
                  >
                    <Image src={url} alt="" fill className="object-contain p-1" unoptimized />
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            {product.brand ? (
              <p className="text-xs uppercase tracking-[0.2em] text-(--color-fg-dim)">
                {product.brand}
              </p>
            ) : null}
            <h1 className="font-display mt-2 text-balance text-4xl leading-tight md:text-5xl">
              {product.name}
            </h1>
            <p className="mt-2 text-sm text-(--color-fg-muted)">
              {[product.category, product.subcategory].filter(Boolean).join(" · ")}
              {product.net_weight ? ` · ${product.net_weight}` : ""}
            </p>
            {product.price_inr != null ? (
              <p className="mt-4 text-2xl font-medium">
                ₹{product.price_inr}
                {product.mrp_inr != null && product.mrp_inr > product.price_inr ? (
                  <span className="ml-2 text-base text-(--color-fg-dim) line-through">
                    ₹{product.mrp_inr}
                  </span>
                ) : null}
              </p>
            ) : null}

            {score ? (
              <div className="mt-10 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
                <ScoreRing score={score.score} size={200} stroke={12} />
                <div>
                  <p className="text-lg text-(--color-fg)">
                    Core score · Grade {score.grade}
                  </p>
                  <p className="mt-1 text-(--color-fg-muted)">
                    {labelForBand(score.band)} · Rule v{score.rule_version}
                  </p>
                  {subscores ? (
                    <div className="mt-6 w-full max-w-sm">
                      <SubscoreBars subscores={subscores} />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-10 rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-3 text-sm text-(--color-fg-muted)">
                Core score pending — needs nutrition data from the platform or OCR.
              </p>
            )}
          </div>
        </div>

        <div className="mt-16">
          <h2 className="font-display text-3xl">Ingredients</h2>
          <p className="mt-2 max-w-2xl text-sm text-(--color-fg-muted)">
            Each ingredient is checked against our additive rules (Yuka-style risk tiers).
            Flagged items reduce the Additives subscore.
          </p>
          <div className="mt-6 max-w-2xl">
            <IngredientPanel ingredientsRaw={product.ingredients_raw} />
          </div>
        </div>

        {product.nutrition ? (
          <div className="mt-12">
            <h2 className="font-display text-3xl">Nutrition</h2>
            <div className="mt-6 max-w-md">
              <NutritionTable nutrition={product.nutrition} />
            </div>
          </div>
        ) : null}

        {attrEntries.length > 0 ? (
          <div className="mt-12">
            <h2 className="font-display text-3xl">Product details</h2>
            <dl className="mt-6 grid gap-3 sm:grid-cols-2">
              {attrEntries.map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-3"
                >
                  <dt className="text-xs uppercase tracking-wider text-(--color-fg-dim)">
                    {key}
                  </dt>
                  <dd className="mt-1 text-sm text-(--color-fg)">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {product.product_url ? (
          <p className="mt-12 text-xs text-(--color-fg-dim)">
            Source:{" "}
            <a
              href={product.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-(--color-fg-muted)"
            >
              View on Blinkit
            </a>
          </p>
        ) : null}
      </Section>
    </main>
  );
}

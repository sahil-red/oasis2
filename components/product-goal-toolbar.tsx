"use client";

import Link from "next/link";
import { AddToBasketButton } from "@/components/add-to-basket-button";
import { CompareButton } from "@/components/compare-button";
import { ShareButton } from "@/components/share-button";
import { ZeptoBuyButton } from "@/components/zepto-buy-button";

/** Basket actions only — goal picks live in ProductGoalFitList. */
export function ProductGoalToolbar({
  slug,
  name,
  image,
  zeptoBuyUrl,
}: {
  slug: string;
  name: string;
  image?: string | null;
  zeptoBuyUrl?: string | null;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <AddToBasketButton slug={slug} name={name} />
      {zeptoBuyUrl ? <ZeptoBuyButton href={zeptoBuyUrl} /> : null}
      <CompareButton slug={slug} name={name} image={image ?? null} size="labelled" />
      <ShareButton title={name} text={`${name} — scored by Scout`} />
      <Link href="/basket" className="text-[15px] text-(--color-accent) hover:underline">
        View basket analysis
      </Link>
    </div>
  );
}

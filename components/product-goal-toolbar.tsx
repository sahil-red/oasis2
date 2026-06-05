"use client";

import Link from "next/link";
import { AddToBasketButton } from "@/components/add-to-basket-button";
import { ZeptoBuyButton } from "@/components/zepto-buy-button";

/** Cart actions only — goal picks live in ProductGoalFitList. */
export function ProductGoalToolbar({
  slug,
  name,
  zeptoBuyUrl,
}: {
  slug: string;
  name: string;
  zeptoBuyUrl?: string | null;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <AddToBasketButton slug={slug} name={name} />
      {zeptoBuyUrl ? <ZeptoBuyButton href={zeptoBuyUrl} /> : null}
      <Link href="/basket" className="text-[15px] text-(--color-accent) hover:underline">
        View cart analysis
      </Link>
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { catalogCardDisplayName } from "@/lib/products/card-display-name";
import { displayPriceInr } from "@/lib/products/display-price";
import type { LandingGoalBoard, LandingPick } from "@/lib/products/landing-insights";
import { colorForGrade, type Grade } from "@/lib/utils";

const GOAL_SEARCH_PARAMS: Record<string, string> = {
  balanced: "/search?verdict=daily_staple",
  gym: "/search?goal=gym&sort=protein-desc",
  bulk: "/search?goal=bulk",
  diabetic: "/search?goal=diabetic",
  "fat-loss": "/search?goal=fat-loss",
  pcos: "/search?goal=pcos",
  "protein-budget": "/search?goal=protein-budget&sort=protein-desc",
  kids: "/search?goal=kids",
};

function GoalProductCard({ pick }: { pick: LandingPick }) {
  const name = catalogCardDisplayName(pick.name);
  const dotColor = pick.grade ? colorForGrade(pick.grade as Grade) : null;

  return (
    <Link href={`/product/${pick.slug}`} className="group flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-xl border border-(--color-line) bg-(--color-bg-soft) transition-colors group-hover:border-(--color-fg-muted)">
        {pick.image ? (
          <Image
            src={pick.image}
            alt={name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
            className="object-contain p-3 transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-xs text-(--color-fg-dim)">
            No image
          </div>
        )}
        {pick.meta && (
          <span className="absolute bottom-2 left-2 rounded-full bg-(--color-bg)/90 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-(--color-fg) backdrop-blur">
            {pick.meta}
          </span>
        )}
      </div>
      <div className="mt-2">
        {pick.brand && (
          <p className="truncate text-[10px] uppercase tracking-[0.12em] text-(--color-fg-dim)">
            {pick.brand}
          </p>
        )}
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-(--color-fg) group-hover:text-(--color-accent) transition-colors">
          {name}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          {dotColor && (
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
          )}
          {pick.price != null && (
            <span className="text-[11px] tabular-nums text-(--color-fg-dim)">
              ₹{pick.price}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function LandingGoalBoards({
  boards,
  initialIndex = 0,
}: {
  boards: LandingGoalBoard[];
  initialIndex?: number;
}) {
  const [active, setActive] = useState(initialIndex % Math.max(1, boards.length));
  if (!boards.length) return null;

  const board = boards[active]!;
  const searchHref = GOAL_SEARCH_PARAMS[board.goal] ?? "/search";

  return (
    <section className="border-b border-(--color-line)">
      <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
              Eat for your goal
            </p>
            <h2 className="font-display mt-3 text-3xl leading-tight md:text-[2.5rem]">
              {board.tagline}
            </h2>
          </div>
          <Link
            href={searchHref}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-(--color-fg-muted) hover:text-(--color-fg)"
          >
            See all <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Goal tab bar */}
        <div className="mb-8 flex flex-wrap gap-2">
          {boards.map((b, i) => (
            <button
              key={b.goal}
              onClick={() => setActive(i)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-150 ${
                i === active
                  ? "border-(--color-fg) bg-(--color-fg) text-(--color-bg)"
                  : "border-(--color-line) text-(--color-fg-muted) hover:border-(--color-fg-muted) hover:text-(--color-fg)"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
          {board.picks.map((pick) => (
            <GoalProductCard key={pick.slug} pick={pick} />
          ))}
        </div>
      </div>
    </section>
  );
}

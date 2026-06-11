import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { LandingPickOfDay } from "@/lib/products/landing-insights";
import { colorForGrade, type Grade } from "@/lib/utils";

export function LandingPickOfDay({ data }: { data: LandingPickOfDay }) {
  const { pick, reasons } = data;
  const gradeColor = pick.grade ? colorForGrade(pick.grade as Grade) : null;

  return (
    <section className="border-b border-(--color-line)">
      <div className="mx-auto max-w-7xl px-6 py-14 md:py-20">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
          Pick of the day
        </p>
        <Link
          href={`/product/${pick.slug}`}
          className="group mt-6 grid gap-6 overflow-hidden rounded-2xl border border-(--color-line) bg-(--color-panel) md:grid-cols-[280px_1fr] lg:grid-cols-[340px_1fr] transition-colors hover:border-(--color-fg-muted)"
        >
          {/* Image */}
          <div className="relative aspect-square bg-(--color-bg-soft) md:aspect-auto md:min-h-[280px]">
            {pick.image ? (
              <Image
                src={pick.image}
                alt={pick.name}
                fill
                sizes="(max-width: 768px) 100vw, 340px"
                className="object-contain p-8 transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-(--color-fg-dim)">
                No image
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex flex-col justify-between p-6 md:p-8 lg:p-10">
            <div>
              {pick.brand && (
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-(--color-fg-dim)">
                  {pick.brand}
                </p>
              )}
              <h2 className="font-display mt-2 text-balance text-2xl leading-tight text-(--color-fg) md:text-3xl lg:text-4xl group-hover:text-(--color-accent) transition-colors">
                {pick.name}
              </h2>

              {/* Score + grade */}
              <div className="mt-4 flex items-center gap-3">
                {pick.score != null && (
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-4xl tabular-nums text-(--color-fg)">
                      {pick.score}
                    </span>
                    <span className="text-sm text-(--color-fg-dim)">/100</span>
                  </div>
                )}
                {gradeColor && (
                  <span
                    className="rounded-md px-2.5 py-1 text-sm font-bold text-white"
                    style={{ backgroundColor: gradeColor }}
                  >
                    {pick.grade}
                  </span>
                )}
                {pick.price != null && (
                  <span className="ml-auto text-sm tabular-nums text-(--color-fg-muted)">
                    ₹{pick.price}
                  </span>
                )}
              </div>

              {/* Reasons */}
              {reasons.length > 0 && (
                <ul className="mt-6 space-y-2">
                  {reasons.map((r, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-sm text-(--color-fg-muted)">
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-(--color-good)" />
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-8 flex items-center gap-1.5 text-sm font-medium text-(--color-fg-muted) group-hover:text-(--color-fg) transition-colors">
              See full label
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
}

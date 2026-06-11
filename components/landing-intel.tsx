"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { LandingFact } from "@/lib/products/landing-insights";

const TONE_STYLES = {
  bad: {
    stat: "text-(--color-bad)",
    dot: "bg-(--color-bad)",
    border: "border-(--color-bad)/20 hover:border-(--color-bad)/40",
  },
  good: {
    stat: "text-(--color-good)",
    dot: "bg-(--color-good)",
    border: "border-(--color-good)/20 hover:border-(--color-good)/40",
  },
  neutral: {
    stat: "text-(--color-fg)",
    dot: "bg-(--color-fg-muted)",
    border: "border-(--color-line) hover:border-(--color-fg-muted)",
  },
};

function actionHref(fact: LandingFact): string {
  const a = fact.action;
  if (a.type === "catalog") {
    const p = new URLSearchParams();
    if (a.verdict) p.set("verdict", a.verdict);
    if (a.sublabel) p.set("sublabel", a.sublabel);
    if (a.sort) p.set("sort", a.sort);
    return `/search?${p.toString()}`;
  }
  if (a.type === "ai_search") return `/search?prompt=${encodeURIComponent(a.prompt)}`;
  if (a.type === "expose" && a.slugs.length > 0) {
    return `/search?scored=1&sort=score-asc`;
  }
  return "/search";
}

export function LandingIntel({ facts }: { facts: LandingFact[] }) {
  if (!facts.length) return null;

  return (
    <section className="border-b border-(--color-line) bg-(--color-bg-soft)">
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-(--color-fg-dim)">
              Scout intel
            </p>
            <h2 className="font-display mt-3 text-3xl leading-tight md:text-[2.5rem]">
              What the data actually says.
            </h2>
          </div>
          <Link
            href="/insights"
            className="hidden items-center gap-1.5 text-sm font-medium text-(--color-fg-muted) hover:text-(--color-fg) md:inline-flex"
          >
            Full report <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {facts.map((fact, i) => {
            const styles = TONE_STYLES[fact.tone];
            const href = actionHref(fact);
            return (
              <Link
                key={i}
                href={href}
                className={`group flex flex-col justify-between rounded-2xl border bg-(--color-panel) p-6 transition-all duration-200 ${styles.border}`}
              >
                <div>
                  <span
                    className={`font-display block text-5xl tabular-nums leading-none ${styles.stat}`}
                  >
                    {fact.stat}
                  </span>
                  <p className="mt-3 text-[14px] leading-snug text-(--color-fg-muted)">
                    {fact.headline}
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-xs font-medium text-(--color-fg-dim) group-hover:text-(--color-fg) transition-colors">
                  <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                  {fact.cta}
                  <ArrowUpRight className="ml-auto h-3 w-3" />
                </div>
              </Link>
            );
          })}
        </div>

        <Link
          href="/insights"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-(--color-fg-muted) hover:text-(--color-fg) md:hidden"
        >
          Full report <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

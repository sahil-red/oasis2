"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function InsightsProductCarousel({
  children,
  className,
  ariaLabel = "Product carousel",
}: {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const syncArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanPrev(scrollLeft > 8);
    setCanNext(scrollLeft < scrollWidth - clientWidth - 8);
  }, []);

  useEffect(() => {
    syncArrows();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(syncArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncArrows, children]);

  const scroll = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const step = Math.max(280, el.clientWidth * 0.85);
    el.scrollBy({ left: dir * step, behavior: "smooth" });
    window.setTimeout(syncArrows, 320);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Previous"
        disabled={!canPrev}
        onClick={() => scroll(-1)}
        className={cn(
          "absolute left-0 top-[42%] z-10 grid h-10 w-10 -translate-x-1/2 place-items-center rounded-full border border-(--color-line) bg-white shadow-md transition hover:border-amber-300 disabled:pointer-events-none disabled:opacity-30 sm:-translate-x-2",
        )}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Next"
        disabled={!canNext}
        onClick={() => scroll(1)}
        className={cn(
          "absolute right-0 top-[42%] z-10 grid h-10 w-10 translate-x-1/2 place-items-center rounded-full border border-(--color-line) bg-white shadow-md transition hover:border-amber-300 disabled:pointer-events-none disabled:opacity-30 sm:translate-x-2",
        )}
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div
        ref={trackRef}
        role="region"
        aria-label={ariaLabel}
        onScroll={syncArrows}
        className="flex gap-4 overflow-x-auto scroll-smooth px-1 pb-2 pt-1 scrollbar-none snap-x snap-mandatory"
      >
        {children}
      </div>
    </div>
  );
}

export function InsightsCarouselSlide({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-[min(85vw,280px)] shrink-0 snap-start sm:w-[300px] lg:w-[320px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

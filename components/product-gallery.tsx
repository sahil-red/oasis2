"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const urls = images.filter(Boolean);
  const [index, setIndex] = useState(0);
  const n = urls.length;

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + n) % n);
  }, [n]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % n);
  }, [n]);

  useEffect(() => {
    if (n <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, prev, next]);

  if (!n) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-(--color-bg-soft) text-sm text-(--color-fg-dim)">
        No image
      </div>
    );
  }

  const current = urls[index];

  return (
    <div className="space-y-3">
      <div className="group relative aspect-square overflow-hidden rounded-2xl bg-(--color-bg-soft)">
        <button
          type="button"
          onClick={() => setIndex((i) => i)}
          className="relative h-full w-full cursor-zoom-in"
          aria-label="View image full size"
        >
          <Image
            src={current}
            alt={alt}
            fill
            className="object-contain p-3 transition duration-300 group-hover:scale-[1.01]"
            sizes="(max-width: 1024px) 100vw, 45vw"
            priority={index === 0}
            unoptimized
          />
        </button>

        {n > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-(--color-line) bg-white/95 text-(--color-fg) shadow-sm transition hover:bg-white md:opacity-0 md:group-hover:opacity-100"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-(--color-line) bg-white/95 text-(--color-fg) shadow-sm transition hover:bg-white md:opacity-0 md:group-hover:opacity-100"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-(--color-line) bg-white/95 px-2.5 py-0.5 text-xs tabular-nums text-(--color-fg-muted) shadow-sm">
              {index + 1} / {n}
            </div>
          </>
        ) : null}
      </div>

      {n > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {urls.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-(--color-bg-soft) transition",
                i === index
                  ? "border-(--color-accent)"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <Image src={url} alt="" fill className="object-contain p-0.5" unoptimized />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

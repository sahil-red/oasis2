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
      <div className="panel flex aspect-square items-center justify-center rounded-2xl text-sm text-(--color-fg-dim)">
        No image
      </div>
    );
  }

  const current = urls[index];

  return (
    <div className="space-y-3">
      <div className="panel group relative aspect-square overflow-hidden rounded-2xl">
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
            className="object-contain p-6 transition duration-300 group-hover:scale-[1.02]"
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
              className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-(--color-bg)/85 text-(--color-fg) ring-1 ring-(--color-line) backdrop-blur transition hover:bg-(--color-panel) md:opacity-0 md:group-hover:opacity-100"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-(--color-bg)/85 text-(--color-fg) ring-1 ring-(--color-line) backdrop-blur transition hover:bg-(--color-panel) md:opacity-0 md:group-hover:opacity-100"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-(--color-bg)/75 px-3 py-1 text-xs tabular-nums text-(--color-fg-muted) backdrop-blur">
              {index + 1} / {n}
            </div>
          </>
        ) : null}
      </div>

      {n > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {urls.map((url, i) => (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 transition",
                i === index
                  ? "ring-(--color-accent)"
                  : "ring-transparent opacity-60 hover:opacity-100",
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

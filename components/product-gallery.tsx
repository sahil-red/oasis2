"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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
  const [zoom, setZoom] = useState(false);
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

  // Lightbox: lock background scroll + close on Escape while zoomed.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [zoom]);

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
          onClick={() => setZoom(true)}
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
          />
        </button>

        {n > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-(--color-line) bg-(--color-panel)/95 text-(--color-fg) shadow-sm transition hover:bg-(--color-panel) md:opacity-0 md:group-hover:opacity-100"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-(--color-line) bg-(--color-panel)/95 text-(--color-fg) shadow-sm transition hover:bg-(--color-panel) md:opacity-0 md:group-hover:opacity-100"
              aria-label="Next image"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-(--color-line) bg-(--color-panel)/95 px-2.5 py-0.5 text-xs tabular-nums text-(--color-fg-muted) shadow-sm">
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
              aria-label={`View image ${i + 1} of ${n}`}
              aria-current={i === index}
              className={cn(
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 bg-(--color-bg-soft) transition",
                i === index
                  ? "border-(--color-accent)"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <Image src={url} alt="" fill sizes="64px" className="object-contain p-0.5" />
            </button>
          ))}
        </div>
      ) : null}

      {zoom ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Product image, full size"
          onClick={() => setZoom(false)}
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label="Close full-size view"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 active:scale-90"
          >
            <X className="h-5 w-5" />
          </button>
          <div
            className="relative h-[80vh] w-full max-w-4xl cursor-zoom-out"
            onClick={(e) => e.stopPropagation()}
          >
            <Image src={current} alt={alt} fill className="object-contain" sizes="92vw" />
          </div>
          {n > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  prev();
                }}
                aria-label="Previous image"
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 active:scale-90 sm:left-6"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  next();
                }}
                aria-label="Next image"
                className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 active:scale-90 sm:right-6"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs tabular-nums text-white backdrop-blur">
                {index + 1} / {n}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

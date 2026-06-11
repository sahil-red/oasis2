"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "Reading your ask…",
  "Scanning 22,000+ labels…",
  "Checking nutrition panels…",
  "Weighing honest trade-offs…",
  "Ranking the shortlist…",
];

/** Narrates the 2–6s search wait — dead air reads as broken; narration reads as work. */
export function SearchProgress() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      1500,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <p
      aria-live="polite"
      className="mt-2 flex items-center gap-2 text-[12px] text-(--color-fg-dim)"
    >
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-(--color-accent)" />
      {STEPS[step]}
    </p>
  );
}

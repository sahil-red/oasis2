"use client";

import { useEffect, useState } from "react";

/**
 * Typewriter cycle through phrases (type → hold → delete → next).
 * Honors prefers-reduced-motion by returning the first phrase statically.
 */
export function useTypewriter(
  phrases: string[],
  { typeMs = 55, holdMs = 1700, deleteMs = 22, startIndex = 0 } = {},
): string {
  const [reduced, setReduced] = useState(false);
  const [idx, setIdx] = useState(startIndex % Math.max(1, phrases.length));
  const [len, setLen] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const target = phrases[idx] ?? "";

  useEffect(() => {
    if (reduced || !phrases.length) return;
    let t: ReturnType<typeof setTimeout>;
    if (!deleting && len < target.length) {
      t = setTimeout(() => setLen((l) => l + 1), typeMs);
    } else if (!deleting) {
      t = setTimeout(() => setDeleting(true), holdMs);
    } else if (len > 0) {
      t = setTimeout(() => setLen((l) => l - 1), deleteMs);
    } else {
      t = setTimeout(() => {
        setDeleting(false);
        setIdx((i) => (i + 1) % phrases.length);
      }, 250);
    }
    return () => clearTimeout(t);
  }, [reduced, deleting, len, target.length, phrases.length, typeMs, holdMs, deleteMs]);

  if (!phrases.length) return "";
  if (reduced) return phrases[0]!;
  return target.slice(0, len);
}

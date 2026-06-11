"use client";

import { useTypewriter } from "@/components/use-typewriter";

/** Search input whose placeholder types itself — drop-in for server forms. */
export function TypewriterInput({
  name,
  phrases,
  prefix = "Try: ",
  startIndex = 0,
  className,
}: {
  name: string;
  phrases: string[];
  prefix?: string;
  startIndex?: number;
  className?: string;
}) {
  const typed = useTypewriter(phrases, { startIndex });
  return (
    <input
      name={name}
      type="search"
      placeholder={`${prefix}${typed}`}
      aria-label="Ask Scout about any packaged food"
      className={className}
    />
  );
}

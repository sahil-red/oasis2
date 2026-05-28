"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  caption: string;
  tone?: "good" | "warn" | "bad" | "neutral";
  showDot?: boolean;
  delay?: number;
  className?: string;
}

const TONE_DOT: Record<NonNullable<StatCardProps["tone"]>, string> = {
  good: "bg-(--color-good)",
  warn: "bg-(--color-warn)",
  bad: "bg-(--color-bad)",
  neutral: "bg-(--color-fg-muted)",
};

const TONE_VALUE: Record<NonNullable<StatCardProps["tone"]>, string> = {
  good: "text-(--color-good)",
  warn: "text-(--color-warn)",
  bad: "text-(--color-bad)",
  neutral: "text-(--color-fg)",
};

export function StatCard({
  label,
  value,
  caption,
  tone = "neutral",
  showDot = true,
  delay = 0,
  className,
}: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.7, delay: delay / 1000, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-(--color-line) bg-(--color-panel) p-5",
        "transition-colors duration-300 hover:border-(--color-line-strong)",
        className
      )}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-(--color-fg-muted)">
        {showDot ? (
          <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} />
        ) : null}
        {label}
      </div>
      <div className={cn("font-display mt-3 text-4xl", TONE_VALUE[tone])}>{value}</div>
      {caption ? (
        <div className="mt-1 text-sm text-(--color-fg-muted)">{caption}</div>
      ) : null}
    </motion.div>
  );
}

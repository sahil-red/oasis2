"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { cn, colorForGrade, gradeFromScore } from "@/lib/utils";

interface ScoreRingProps {
  score: number;
  size?: number;
  stroke?: number;
  className?: string;
  showLabel?: boolean;
  /** When set, overrides grade line under the score (e.g. band label). */
  subtitle?: string;
  delay?: number;
}

function labelClasses(size: number) {
  if (size >= 160) return { score: "text-5xl", sub: "text-xs" };
  if (size >= 120) return { score: "text-4xl", sub: "text-[11px]" };
  if (size >= 88) return { score: "text-2xl", sub: "text-[10px]" };
  return { score: "text-xl", sub: "text-[9px]" };
}

export function ScoreRing({
  score,
  size = 220,
  stroke = 14,
  className,
  showLabel = true,
  subtitle,
  delay = 0,
}: ScoreRingProps) {
  const grade = gradeFromScore(score);
  const color = colorForGrade(grade);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setAnimatedScore(score), 120 + delay);
    return () => window.clearTimeout(id);
  }, [score, delay]);

  const dashOffset = circumference * (1 - animatedScore / 100);
  const labels = labelClasses(size);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(0,0,0,0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.4, delay: delay / 1000, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 12px ${color}33)` }}
        />
      </svg>
      {showLabel ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-1 text-center">
          <div
            className={cn("font-display leading-none tabular-nums", labels.score)}
            style={{ color }}
          >
            {animatedScore}
          </div>
          <div
            className={cn(
              "mt-0.5 max-w-[85%] truncate uppercase tracking-[0.14em] text-(--color-fg-muted)",
              labels.sub,
            )}
          >
            {subtitle ?? `Grade ${grade}`}
          </div>
        </div>
      ) : null}
    </div>
  );
}

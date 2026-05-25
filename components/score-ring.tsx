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
  delay?: number;
}

export function ScoreRing({
  score,
  size = 220,
  stroke = 14,
  className,
  showLabel = true,
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
          stroke="rgba(255,255,255,0.06)"
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
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="font-display text-6xl leading-none"
            style={{ color }}
          >
            {animatedScore}
          </div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] text-(--color-fg-muted)">
            Grade {grade}
          </div>
        </div>
      ) : null}
    </div>
  );
}

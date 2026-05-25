"use client";

import { motion } from "framer-motion";
import { ScanLine, ShieldCheck, Sparkles, Camera, Beaker } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  scan: ScanLine,
  shield: ShieldCheck,
  sparkles: Sparkles,
  camera: Camera,
  beaker: Beaker,
} as const;

export type FeatureIcon = keyof typeof ICONS;

interface FeatureStepProps {
  index: number;
  icon: FeatureIcon;
  title: string;
  body: string;
  delay?: number;
  className?: string;
}

export function FeatureStep({
  index,
  icon,
  title,
  body,
  delay = 0,
  className,
}: FeatureStepProps) {
  const Icon = ICONS[icon];
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay: delay / 1000, ease: [0.22, 1, 0.36, 1] }}
      className={cn("relative", className)}
    >
      <div className="flex items-center gap-3 text-(--color-fg-muted)">
        <span className="font-display text-(--color-accent) text-2xl">
          {String(index).padStart(2, "0")}
        </span>
        <div className="hairline flex-1" />
      </div>
      <div className="mt-6 flex items-start gap-4">
        <div className="glass flex h-11 w-11 items-center justify-center rounded-xl">
          <Icon className="h-5 w-5 text-(--color-accent)" />
        </div>
        <div>
          <h3 className="font-display text-2xl">{title}</h3>
          <p className="mt-2 text-(--color-fg-muted)">{body}</p>
        </div>
      </div>
    </motion.div>
  );
}

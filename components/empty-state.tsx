import type { ReactNode } from "react";
import { Sprig } from "@/components/scout-motifs";

/**
 * One warm, editorial empty state used everywhere a list can be empty (cart,
 * insights sections, no-results) — a small sprig, a serif line, calm copy, and an
 * optional action. Never leaves a blank gap.
 */
export function EmptyState({
  title,
  children,
  action,
  motif = "sprig",
  className = "",
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  motif?: "sprig" | "none";
  className?: string;
}) {
  return (
    <div className={`mx-auto flex max-w-md flex-col items-center px-6 py-12 text-center ${className}`}>
      {motif === "sprig" ? <Sprig className="mb-3 h-10 w-[26px] text-(--color-fg-dim) opacity-55" /> : null}
      <p className="font-display text-[1.6rem] leading-tight text-(--color-fg)">{title}</p>
      {children ? (
        <div className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-(--color-fg-muted)">{children}</div>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

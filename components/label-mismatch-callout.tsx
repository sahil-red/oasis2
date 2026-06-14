import { AlertTriangle } from "lucide-react";
import type { LabelMismatchDetail } from "@/lib/scoring/labels-score";

/** PDP warning: the front-of-pack claim contradicts the back label.
 *  This is Scout's signature catch — the marketing promise quoted in serif,
 *  then punctured by what the panel actually says. */
export function LabelMismatchCallout({ detail }: { detail: LabelMismatchDetail }) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: "color-mix(in srgb, var(--color-bad) 30%, transparent)" }}
    >
      <div
        className="flex items-center gap-2 px-3.5 py-2"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-bad) 10%, var(--color-panel))" }}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-(--color-bad)" aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--color-bad)">
          Front label vs back label
        </p>
      </div>
      <div className="space-y-1.5 bg-(--color-panel) px-3.5 py-3">
        <p className="font-display text-[1.15rem] italic leading-snug text-(--color-fg)">
          &ldquo;{detail.claim}&rdquo;
        </p>
        <p className="text-[13px] leading-snug text-(--color-fg-muted)">
          <span className="font-semibold text-(--color-bad)">But </span>
          {detail.reality}.
        </p>
      </div>
    </div>
  );
}

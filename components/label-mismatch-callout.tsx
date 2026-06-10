import { AlertTriangle } from "lucide-react";
import type { LabelMismatchDetail } from "@/lib/scoring/labels-score";

/** PDP warning: the front-of-pack claim contradicts the back label.
 *  This is Scout's signature catch — give it real visual weight. */
export function LabelMismatchCallout({ detail }: { detail: LabelMismatchDetail }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl border p-3.5"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-bad) 8%, var(--color-panel))",
        borderColor: "color-mix(in srgb, var(--color-bad) 30%, transparent)",
      }}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-(--color-bad)" aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-(--color-bad)">
          Front label vs back label
        </p>
        <p className="mt-1 text-[13px] leading-snug text-(--color-fg)">
          The pack says <strong>“{detail.claim}”</strong> — but {detail.reality}.
        </p>
      </div>
    </div>
  );
}

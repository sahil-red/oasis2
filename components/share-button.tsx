"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";

/** Share the verdict — native share sheet on mobile, copy-link on desktop. */
export function ShareButton({ title, text }: { title: string; text?: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        /* user dismissed the sheet — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — nothing sane to do */
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-lg border border-(--color-line) bg-(--color-panel) px-3 py-2 text-sm font-medium text-(--color-fg) hover:border-(--color-fg)"
    >
      {copied ? <Check className="h-4 w-4 text-(--color-good)" /> : <Share2 className="h-4 w-4" />}
      {copied ? "Link copied" : "Share"}
    </button>
  );
}

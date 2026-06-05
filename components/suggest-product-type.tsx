"use client";

import { useState } from "react";

export function SuggestProductType() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setStatus("error");
      setMessage("Please enter a product name.");
      return;
    }
    setStatus("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/product-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Try again.");
        return;
      }
      setStatus("done");
      setMessage("Thanks — we'll use this when expanding the catalog.");
      setName("");
    } catch {
      setStatus("error");
      setMessage("Could not send. Check your connection and try again.");
    }
  }

  return (
    <div className="mt-5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-(--color-fg-muted) underline decoration-(--color-line-strong) underline-offset-[3px] transition hover:text-(--color-fg)"
        >
          Suggest a product type
        </button>
      ) : (
        <form onSubmit={submit} className="max-w-md space-y-2">
          <p className="text-sm text-(--color-fg-muted)">
            Missing something on Scout? Tell us what to add next.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (status === "error") setStatus("idle");
              }}
              placeholder="e.g. ragi chips, oat milk, millet pasta"
              maxLength={200}
              className="min-h-10 flex-1 rounded-xl border border-(--color-line) bg-(--color-bg-soft) px-3 text-sm text-(--color-fg) outline-none placeholder:text-(--color-fg-dim) focus:border-(--color-fg-muted)"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="min-h-10 rounded-xl bg-(--color-fg) px-4 text-sm font-semibold text-(--color-bg) transition hover:opacity-90 disabled:opacity-60"
            >
              {status === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
          {message ? (
            <p
              className={
                status === "error"
                  ? "text-xs text-(--score-bad)"
                  : "text-xs text-(--color-fg-muted)"
              }
            >
              {message}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setStatus("idle");
              setMessage(null);
            }}
            className="text-xs text-(--color-fg-dim) underline underline-offset-2 hover:text-(--color-fg-muted)"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-xl px-6 py-24 text-center">
      <h1 className="font-display text-3xl">Something went wrong</h1>
      <p className="mt-4 text-(--color-fg-muted)">An unexpected error occurred. Please try again.</p>
      <button
        onClick={reset}
        className="mt-6 rounded-xl bg-(--color-fg) px-6 py-2.5 text-sm font-medium text-(--color-bg)"
      >
        Try again
      </button>
    </main>
  );
}

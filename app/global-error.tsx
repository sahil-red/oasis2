"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <main style={{ maxWidth: 500, margin: "100px auto", textAlign: "center", fontFamily: "system-ui" }}>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p style={{ color: "#666", marginTop: 12 }}>Please try again. If the problem persists, contact support.</p>
          <button
            onClick={reset}
            style={{ marginTop: 24, padding: "10px 24px", borderRadius: 12, background: "#111", color: "#fff", border: "none", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}

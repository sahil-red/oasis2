import * as Sentry from "@sentry/nextjs";

// Inert until SENTRY_DSN is set in Vercel — zero overhead without it.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  // Errors are the point; keep tracing light to stay inside the free tier.
  tracesSampleRate: 0.1,
});

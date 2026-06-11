import * as Sentry from "@sentry/nextjs";

// Inert until NEXT_PUBLIC_SENTRY_DSN is set in Vercel.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

/**
 * Public entry point for the grocery scraping SDK.
 *
 * Other code (scripts, API routes) should only import from here, not from
 * the per-platform files. That keeps the adapter swap cost at one line.
 */

import { BlinkitAdapter } from "./blinkit";
import { ZeptoAdapter } from "./zepto";
import type { GroceryAdapter, Platform } from "./types";

export * from "./types";
export { loadSession, saveSession, sessionFromCurl, readCookie } from "./session";
export { makeThrottledFetch, fetchJson, sleep } from "./http";

/**
 * Resolve an adapter by platform name. Throws on unknown platforms so a
 * typo in env doesn't silently degrade to a stub.
 */
export function getAdapter(
  platform: Platform,
  opts: { rps?: number; burst?: number } = {},
): GroceryAdapter {
  switch (platform) {
    case "blinkit":
      return new BlinkitAdapter(opts);
    case "zepto":
      return new ZeptoAdapter(opts);
    case "swiggy":
      throw new Error(`[grocery] adapter for "${platform}" is not yet implemented.`);
    default: {
      const exhaustive: never = platform;
      throw new Error(`[grocery] unknown platform: ${exhaustive}`);
    }
  }
}

export function platformFromEnv(): Platform {
  const raw = (process.env.GROCERY_PLATFORM ?? "blinkit").trim().toLowerCase();
  if (raw === "blinkit" || raw === "zepto" || raw === "swiggy") return raw;
  throw new Error(
    `[grocery] GROCERY_PLATFORM="${raw}" is not supported. Use blinkit | zepto | swiggy.`,
  );
}

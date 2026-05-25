/**
 * Playwright-based fetch backend (the only one that reliably passes
 * Cloudflare bot manager for Blinkit/Zepto/Instamart).
 *
 * WHY THIS EXISTS:
 *   We proved empirically that Cloudflare's `__cf_bm` cookie is bound to
 *   the TLS handshake it was issued under. Replaying the cookies via
 *   Node fetch, libcurl, or system curl all returned 403 because their
 *   TLS fingerprints don't match Chrome's. Playwright's standalone
 *   APIRequestContext doesn't help — internally it uses Node's HTTP
 *   stack with the same Node TLS fingerprint.
 *
 *   Blinkit APIs are same-origin → `page.evaluate(fetch)` (passes CF).
 *   Zepto hits `api.zepto.co.in` (cross-origin) → `context.request.fetch`
 *   (no CORS; still sends cookies from storage state).
 *
 * Lifecycle:
 *   First call lazily launches a headless Chromium with the saved
 *   `storageState`, navigates to https://blinkit.com/ (so same-origin
 *   fetches work with credentials), and parks the page there. Every
 *   subsequent fetch reuses the same page. Call `closePlaywrightFetch()`
 *   on process exit to clean up.
 *
 * Storage state freshness:
 *   Cloudflare periodically rotates `__cf_bm` server-side. As the page
 *   makes requests, Chromium auto-receives Set-Cookie updates. We
 *   re-save the storageState to disk every N calls so a crashed run can
 *   resume from a still-valid session.
 */

import pThrottle from "p-throttle";
import type { FetchOptions, ThrottledFetch } from "./http";

// We lazy-import 'playwright' so consumers who never enable this backend
// don't pay the ~200ms import cost (and so the package is optional in CI).
type PWModule = typeof import("playwright");
type Browser = import("playwright").Browser;
type BrowserContext = import("playwright").BrowserContext;
type Page = import("playwright").Page;

interface PlaywrightState {
  pw: PWModule;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  storagePath: string;
  callsSinceSave: number;
}

const _states = new Map<string, Promise<PlaywrightState>>();
/** Debounce full homepage reloads — each one costs ~6s and triggers more blocks if spammed. */
let _lastCfRefreshMs = 0;
/** One in-flight page.evaluate at a time — CF reload navigates the page and kills parallel evals. */
let _fetchChain: Promise<unknown> = Promise.resolve();

function enqueueFetch<T>(fn: () => Promise<T>): Promise<T> {
  const next = _fetchChain.then(fn, fn);
  _fetchChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

const DEFAULT_ORIGIN = "https://blinkit.com";
const SAVE_EVERY = 25;
const CF_REFRESH_COOLDOWN_MS = Number(process.env.CF_REFRESH_COOLDOWN_MS) || 45_000;

function isCloudflareChallenge(status: number, body: string): boolean {
  return (
    (status === 403 || status === 503) &&
    /just a moment|cloudflare|cf-browser-verification|challenge-platform/i.test(body)
  );
}

/** Re-hit the homepage so Chromium can refresh __cf_bm / solve a soft block. */
async function refreshCfSession(state: PlaywrightState, force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && now - _lastCfRefreshMs < CF_REFRESH_COOLDOWN_MS) {
    return false;
  }
  _lastCfRefreshMs = now;
  const origin = pageOrigin(state, DEFAULT_ORIGIN);
  console.warn(
    `[grocery/http-playwright] Cloudflare block — reloading ${origin} to refresh cookies…`,
  );
  await state.page.goto(`${origin}/`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  await state.page.waitForTimeout(2_500);
  try {
    await state.context.storageState({ path: state.storagePath });
  } catch {
    // Non-fatal.
  }
  return true;
}

function launchOptions(pw: PWModule): Parameters<PWModule["chromium"]["launch"]>[0] {
  const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";
  const base: Parameters<PWModule["chromium"]["launch"]>[0] = {
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  };
  if (
    process.env.PLAYWRIGHT_USE_CHROME === "1" ||
    process.env.PLAYWRIGHT_CHANNEL === "chrome"
  ) {
    return { ...base, channel: "chrome" };
  }
  return base;
}

async function launchBrowser(pw: PWModule): Promise<Browser> {
  try {
    return await pw.chromium.launch(launchOptions(pw));
  } catch (e) {
    if (process.env.PLAYWRIGHT_USE_CHROME === "1") {
      console.warn(
        "[grocery/http-playwright] Chrome channel unavailable, falling back to bundled Chromium:",
        (e as Error).message,
      );
      return pw.chromium.launch({
        headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
        args: ["--disable-blink-features=AutomationControlled"],
      });
    }
    throw e;
  }
}

async function getState(storagePath: string, origin: string): Promise<PlaywrightState> {
  const key = `${storagePath}::${origin}`;
  const existing = _states.get(key);
  if (existing) return existing;
  const created = (async () => {
    const pw = await import("playwright");

    const browser = await launchBrowser(pw);

    const context = await browser.newContext({
      storageState: storagePath,
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    });

    // Reduce automation indicators (some bot managers check navigator.webdriver).
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const page = await context.newPage();
    // Navigate so that `fetch()` inside page.evaluate runs same-origin to
    // blinkit.com — Blinkit's API rejects cross-origin (CORS) requests, but
    // same-origin requests bypass that entirely.
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });

    return {
      pw,
      browser,
      context,
      page,
      storagePath,
      callsSinceSave: 0,
    };
  })();
  _states.set(key, created);
  return created;
}

/** Force the next request to launch a fresh browser (e.g. after a CF streak). */
export async function closePlaywrightFetch(): Promise<void> {
  _lastCfRefreshMs = 0;
  const entries = [..._states.entries()];
  _states.clear();
  for (const [, promise] of entries) {
    const s = await promise.catch(() => null);
    if (!s) continue;
    try {
      await s.context.storageState({ path: s.storagePath });
    } catch {}
    try {
      await s.browser.close();
    } catch {}
  }
}

// Best-effort cleanup on natural exit. Doesn't run on SIGKILL, but covers
// the common cases.
let _exitHookInstalled = false;
function installExitHook() {
  if (_exitHookInstalled) return;
  _exitHookInstalled = true;
  const close = () => {
    if (_states.size > 0) void closePlaywrightFetch();
  };
  process.on("exit", close);
  process.on("SIGINT", () => {
    close();
    setTimeout(() => process.exit(130), 200);
  });
  process.on("SIGTERM", () => {
    close();
    setTimeout(() => process.exit(143), 200);
  });
}

function pageOrigin(state: PlaywrightState, fallbackOrigin: string): string {
  if (state.page.url().startsWith("http")) {
    try {
      return new URL(state.page.url()).origin;
    } catch {
      // fall through
    }
  }
  return fallbackOrigin;
}

function isCrossOriginFetch(pageOriginUrl: string, targetUrl: string): boolean {
  try {
    return new URL(targetUrl).origin !== new URL(pageOriginUrl).origin;
  } catch {
    return true;
  }
}

async function runFetch(
  state: PlaywrightState,
  fallbackOrigin: string,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
): Promise<{ status: number; body: string }> {
  const origin = pageOrigin(state, fallbackOrigin);
  if (isCrossOriginFetch(origin, url)) {
    const resp = await state.context.request.fetch(url, {
      method,
      headers,
      data: body,
      timeout: 45_000,
      failOnStatusCode: false,
    });
    return { status: resp.status(), body: await resp.text() };
  }

  return state.page.evaluate(
    async ({ url, method, headers, body }) => {
      const r = await fetch(url, {
        method,
        headers,
        body,
        credentials: "include",
      });
      return { status: r.status, body: await r.text() };
    },
    { url, method, headers, body },
  );
}

function normaliseHeaders(h: FetchOptions["headers"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (Array.isArray(h)) {
    for (const [k, v] of h) out[k] = String(v);
  } else if (h instanceof Headers) {
    h.forEach((v, k) => { out[k] = v; });
  } else {
    Object.assign(out, h as Record<string, string>);
  }
  return out;
}

export function makePlaywrightFetch(opts: {
  storageStatePath: string;
  /** Site origin for same-origin API calls (e.g. https://www.zepto.com). */
  origin?: string;
  rps?: number;
  burst?: number;
}): ThrottledFetch {
  const origin = opts.origin ?? DEFAULT_ORIGIN;
  installExitHook();

  const rps = opts.rps ?? 2;
  const burst = opts.burst ?? 1;
  const throttle = pThrottle({ limit: burst, interval: Math.floor(1000 / rps) });

  const throttled = throttle(async (url: string, init: FetchOptions = {}) =>
    enqueueFetch(async () => {
    const state = await getState(opts.storageStatePath, origin);

    const retries = init.retries ?? 3;
    const baseBackoff = init.backoffMs ?? 800;
    const failFast429 = init.failFast429 === true;
    const label = init.label ?? new URL(url).pathname;

    const headers = normaliseHeaders(init.headers);
    // Chromium owns cookies via the page context; explicitly setting Cookie
    // would override the live cookie jar and break rotation.
    delete headers["cookie"];
    delete headers["Cookie"];

    const body = init.body == null ? undefined : String(init.body);
    const method = init.method ?? "GET";

    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await runFetch(state, origin, url, method, headers, body);

        if (
          result.status === 429 ||
          result.status >= 500 ||
          isCloudflareChallenge(result.status, result.body)
        ) {
          let wait = baseBackoff * Math.pow(2, attempt);
          if (result.status === 429) {
            wait = Math.max(wait, failFast429 ? 30_000 : 5_000 * (attempt + 1));
            if (failFast429 && attempt >= 1) {
              throw new Error(
                `[grocery/http-playwright] ${label} → 429 rate limited (fail-fast)`,
              );
            }
          }
          if (isCloudflareChallenge(result.status, result.body)) {
            const refreshed = await refreshCfSession(state);
            await sleep(refreshed ? wait + 1_000 : wait + 3_500);
          } else {
            console.warn(
              `[grocery/http-playwright] ${label} → ${result.status}, retry in ${wait}ms (attempt ${attempt + 1}/${retries + 1})`,
            );
            await sleep(wait);
          }
          continue;
        }

        // Persist updated cookies/localStorage periodically so cf_bm rotation
        // is captured across long runs / crashes.
        state.callsSinceSave++;
        if (state.callsSinceSave >= SAVE_EVERY) {
          state.callsSinceSave = 0;
          try {
            await state.context.storageState({ path: state.storagePath });
          } catch {
            // Non-fatal — we'll try again later.
          }
        }

        return new Response(result.body, { status: result.status });
      } catch (e) {
        lastErr = e;
        const wait = baseBackoff * Math.pow(2, attempt);
        console.warn(
          `[grocery/http-playwright] ${label} → ${(e as Error).message}, retry in ${wait}ms`,
        );
        await sleep(wait);
      }
    }
    throw new Error(
      `[grocery/http-playwright] ${label} failed after ${retries + 1} attempts: ${String(lastErr)}`,
    );
  }),
  ) as unknown as ThrottledFetch;

  throttled.bucket = throttle;
  return throttled;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

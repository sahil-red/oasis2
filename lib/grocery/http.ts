/**
 * Tiny throttled, retrying fetch wrapper shared across grocery adapters.
 *
 * We deliberately don't reach for axios/got — Node 22+'s fetch is plenty,
 * and pulling in another HTTP stack is more attack surface for the scraper.
 */

import pThrottle from "p-throttle";

export interface FetchOptions extends RequestInit {
  /** Max retries on 5xx / network errors. Defaults to 3. */
  retries?: number;
  /** Base backoff in ms — doubled each attempt. Defaults to 800. */
  backoffMs?: number;
  /** Optional request label for logging. */
  label?: string;
  /** After one 429 retry, stop (avoids hammering a hot rate limit). */
  failFast429?: boolean;
}

export interface ThrottledFetch {
  (url: string, init?: FetchOptions): Promise<Response>;
  /** Throttle bucket the caller can reuse for sibling requests. */
  bucket: ReturnType<typeof pThrottle>;
}

/**
 * Builds a throttled fetch. Default ~2 requests/sec is the sweet spot for
 * Indian quick-commerce sites: fast enough to scrape ~10k SKUs overnight,
 * slow enough that bot detectors rarely escalate.
 */
export function makeThrottledFetch(
  opts: { rps?: number; burst?: number } = {},
): ThrottledFetch {
  const rps = opts.rps ?? 2;
  const burst = opts.burst ?? 1;
  const throttle = pThrottle({ limit: burst, interval: Math.floor(1000 / rps) });

  const throttledFetch = throttle(async (url: string, init: FetchOptions = {}) => {
    const retries = init.retries ?? 3;
    const baseBackoff = init.backoffMs ?? 800;
    const label = init.label ?? new URL(url).pathname;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await fetch(url, init);
        if (resp.status === 429 || resp.status >= 500) {
          const retryAfter = Number(resp.headers.get("retry-after"));
          const wait = retryAfter
            ? retryAfter * 1000
            : baseBackoff * Math.pow(2, attempt);
          console.warn(
            `[grocery/http] ${label} → ${resp.status}, retry in ${wait}ms (attempt ${attempt + 1}/${retries + 1})`,
          );
          await sleep(wait);
          continue;
        }
        return resp;
      } catch (err) {
        lastErr = err;
        const wait = baseBackoff * Math.pow(2, attempt);
        console.warn(
          `[grocery/http] ${label} → ${(err as Error).message}, retry in ${wait}ms`,
        );
        await sleep(wait);
      }
    }
    throw new Error(
      `[grocery/http] ${label} failed after ${retries + 1} attempts: ${String(lastErr)}`,
    );
  }) as unknown as ThrottledFetch;

  throttledFetch.bucket = throttle;
  return throttledFetch;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Type-safe JSON helper that throws on non-2xx with the response body. */
export async function fetchJson<T>(
  fetchFn: ThrottledFetch,
  url: string,
  init: FetchOptions = {},
): Promise<T> {
  const resp = await fetchFn(url, init);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(
      `[grocery/http] ${init.label ?? new URL(url).pathname} HTTP ${resp.status}: ${body.slice(0, 500)}`,
    );
  }
  return (await resp.json()) as T;
}

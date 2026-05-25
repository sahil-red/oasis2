/**
 * curl-subprocess fetch backend.
 *
 * WHY THIS EXISTS:
 *   Cloudflare's `__cf_bm` cookie is issued bound to the TLS handshake it
 *   was negotiated during. Node 22's undici fetch has a TLS fingerprint
 *   (JA3/JA4) that doesn't match Chrome's, so even when we replay the
 *   exact cookies + headers a real browser used, Cloudflare's bot manager
 *   rejects the request with 403 because the TLS context differs.
 *
 *   The pragmatic fix: shell out to the system `curl` binary, which on
 *   macOS uses LibreSSL/OpenSSL with a TLS profile Cloudflare's bot rules
 *   generally accept when the cookies are fresh. This also gives us
 *   HTTP/2 (via `--http2`) for free, which mirrors what the browser does.
 *
 * Interface:
 *   Same `ThrottledFetch` shape as `./http.ts`'s `makeThrottledFetch`, so
 *   adapters can swap implementations behind an env flag without code changes.
 */

import { spawn } from "node:child_process";
import pThrottle from "p-throttle";
import type { FetchOptions, ThrottledFetch } from "./http";

interface CurlResponse {
  status: number;
  bodyText: string;
}

function runCurl(url: string, init: FetchOptions): Promise<CurlResponse> {
  return new Promise((resolve, reject) => {
    const args = ["-sS", "--compressed", "--http2", "-w", "\n__STATUS:%{http_code}"];

    if (init.method && init.method !== "GET") {
      args.push("-X", init.method);
    }

    const headersObj: Record<string, string> = {};
    const h = init.headers;
    if (h instanceof Headers) {
      h.forEach((v, k) => { headersObj[k] = v; });
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) headersObj[k] = v;
    } else if (h && typeof h === "object") {
      Object.assign(headersObj, h as Record<string, string>);
    }
    for (const [k, v] of Object.entries(headersObj)) {
      args.push("-H", `${k}: ${v}`);
    }

    if (init.body) {
      args.push("--data-raw", typeof init.body === "string" ? init.body : String(init.body));
    }

    args.push(url);

    const proc = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on("data", (b) => out.push(b));
    proc.stderr.on("data", (b) => err.push(b));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(
            `curl exited ${code}: ${Buffer.concat(err).toString("utf8").slice(0, 300)}`,
          ),
        );
      }
      const raw = Buffer.concat(out).toString("utf8");
      // Status sentinel is the LAST line — split by the last occurrence.
      const m = /\n__STATUS:(\d+)\s*$/.exec(raw);
      const status = m ? Number(m[1]) : 0;
      const bodyText = m ? raw.slice(0, m.index) : raw;
      resolve({ status, bodyText });
    });
  });
}

export function makeCurlFetch(
  opts: { rps?: number; burst?: number } = {},
): ThrottledFetch {
  const rps = opts.rps ?? 2;
  const burst = opts.burst ?? 1;
  const throttle = pThrottle({ limit: burst, interval: Math.floor(1000 / rps) });

  const throttled = throttle(async (url: string, init: FetchOptions = {}) => {
    const retries = init.retries ?? 3;
    const baseBackoff = init.backoffMs ?? 800;
    const label = init.label ?? new URL(url).pathname;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { status, bodyText } = await runCurl(url, init);
        if (status === 429 || status >= 500) {
          const wait = baseBackoff * Math.pow(2, attempt);
          console.warn(
            `[grocery/http-curl] ${label} → ${status}, retry in ${wait}ms (attempt ${attempt + 1}/${retries + 1})`,
          );
          await sleep(wait);
          continue;
        }
        // Stand in for the spec Response so fetchJson() can call .text()/.json()/.ok.
        return new Response(bodyText, { status });
      } catch (e) {
        lastErr = e;
        const wait = baseBackoff * Math.pow(2, attempt);
        console.warn(
          `[grocery/http-curl] ${label} → ${(e as Error).message}, retry in ${wait}ms`,
        );
        await sleep(wait);
      }
    }
    throw new Error(
      `[grocery/http-curl] ${label} failed after ${retries + 1} attempts: ${String(lastErr)}`,
    );
  }) as unknown as ThrottledFetch;

  throttled.bucket = throttle;
  return throttled;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

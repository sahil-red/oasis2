#!/usr/bin/env -S pnpm tsx
/**
 * Diagnose what our Blinkit adapter is sending vs. what Blinkit's real
 * web client sends. Used to nail down the product-detail endpoint.
 *
 *   1. Run `pnpm warm-session` first (with a homepage/listing XHR cURL).
 *   2. On blinkit.com, click any product to load its detail page.
 *   3. DevTools → Network → "Fetch/XHR" filter → find the XHR that loads
 *      the product detail (often largest response, has product id in URL
 *      or body). Right-click → Copy → Copy as cURL (bash).
 *   4. Paste into `.cache/blinkit-product-sample-curl.txt`.
 *   5. Run `pnpm tsx scripts/diag-blinkit.ts`.
 *
 * Output: side-by-side of what we'd send vs. what works, with a diff
 * pointing at the precise mismatch.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { loadSession } from "@/lib/grocery";

loadEnv({ path: ".env.local" });

const CACHE = ".cache";

interface ParsedCurl {
  url: string;
  method: string;
  headers: Record<string, string>;
  cookies: Record<string, string>;
  body: string | null;
}

function parseCurl(text: string): ParsedCurl {
  // Strip line continuations.
  const flat = text.replace(/\\\n\s*/g, " ").replace(/\s+/g, " ");

  // URL: the FIRST standalone-quoted http(s):// string in the file.
  // Header values like `-H 'referer: https://…'` won't match this because
  // their opening quote precedes "referer:", not "https://".
  // Bare URLs (without quotes, when present at the very end of the line)
  // are caught by a fallback.
  let url = "";
  const urlQuoted = /'(https?:\/\/[^']+)'/.exec(flat);
  const urlBare = /\bcurl\s+(?:--\S+\s+)*(https?:\/\/\S+)/.exec(flat);
  url = urlQuoted?.[1] ?? urlBare?.[1] ?? "";

  // Method: --request/-X, else GET (or POST if --data present).
  const methodMatch = /(?:-X|--request)\s+'?(\w+)'?/.exec(flat);
  const hasBody = /(?:--data|--data-raw|--data-binary|-d)\s+'/.test(flat);
  const method = methodMatch?.[1] ?? (hasBody ? "POST" : "GET");

  // Headers.
  const headers: Record<string, string> = {};
  let cookies: Record<string, string> = {};
  const headerRe = /(?:-H|--header)\s+'([^']+)'/g;
  for (const m of flat.matchAll(headerRe)) {
    const [name, ...rest] = m[1].split(":");
    const value = rest.join(":").trim();
    if (name.trim().toLowerCase() === "cookie") {
      cookies = parseCookieStr(value);
    } else {
      headers[name.trim().toLowerCase()] = value;
    }
  }
  const bFlag = /(?:-b|--cookie)\s+'([^']+)'/.exec(flat);
  if (bFlag && Object.keys(cookies).length === 0) cookies = parseCookieStr(bFlag[1]);

  // Body.
  const bodyMatch = /(?:--data-raw|--data-binary|--data|-d)\s+'([^']*)'/.exec(flat);
  const body = bodyMatch?.[1] ?? null;

  return { url, method, headers, cookies, body };
}

function parseCookieStr(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of s.split(/;\s*/)) {
    const i = pair.indexOf("=");
    if (i <= 0) continue;
    out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
  return out;
}

function redact(value: string, keepLast = 4): string {
  if (!value) return "";
  if (value.length <= keepLast + 4) return value;
  return `${value.slice(0, 4)}…${value.slice(-keepLast)}  (${value.length} chars)`;
}

function fmtHeaders(h: Record<string, string>, sensitive: string[]) {
  const out: string[] = [];
  const keys = Object.keys(h).sort();
  for (const k of keys) {
    const v = sensitive.includes(k) ? redact(h[k]) : h[k];
    out.push(`    ${k.padEnd(28)} ${v}`);
  }
  return out.join("\n");
}

function fmtCookies(c: Record<string, string>) {
  const out: string[] = [];
  for (const k of Object.keys(c).sort()) {
    out.push(`    ${k.padEnd(28)} ${redact(c[k], 6)}`);
  }
  return out.join("\n");
}

const SENSITIVE = new Set([
  "auth_key",
  "authorization",
  "x-csrf-token",
  "tee-token",
  "device_id",
  "session_uuid",
]);

async function main() {
  const session = await loadSession("blinkit");
  if (!session) {
    console.error(
      "[diag-blinkit] no warmed session at .cache/blinkit-session.json. Run `pnpm warm-session` first.",
    );
    process.exit(1);
  }

  console.log("━━━━━━━━━ WHAT OUR ADAPTER WOULD SEND (warm-session capture) ━━━━━━━━━");
  console.log(`url:     <constructed at call time>`);
  console.log(`method:  GET`);
  console.log(`session warmed_at: ${session.warmed_at}`);
  console.log(`location: ${session.location ? JSON.stringify(session.location) : "(none)"}`);
  console.log(`headers (${Object.keys(session.headers).length}):`);
  console.log(fmtHeaders(session.headers, [...SENSITIVE]));
  console.log(`cookies (${session.cookies.split(";").filter(Boolean).length}):`);
  console.log(fmtCookies(parseCookieStr(session.cookies)));

  const samplePath = path.join(CACHE, "blinkit-product-sample-curl.txt");
  let sample: string;
  try {
    sample = await readFile(samplePath, "utf8");
  } catch {
    console.log(`\n[diag-blinkit] ${samplePath} not found.`);
    console.log(
      `  To fill it: on blinkit.com click any product to open its detail page,\n` +
        `  DevTools → Network → Fetch/XHR → find the XHR that loads the product\n` +
        `  payload (largest JSON response, contains the product id), right-click\n` +
        `  → Copy → Copy as cURL (bash). Paste into ${samplePath} and re-run.`,
    );
    return;
  }

  const parsed = parseCurl(sample);

  // Sanity-check: warn loudly if the captured cURL is obviously not a
  // product-detail call (analytics, sentry, offers panel, serviceability).
  const WRONG_PATTERNS = [
    "secondary-data",
    "/collect",
    "/events",
    "/visibility",
    "/eta",
    "/receive",
    "/main",
    "/deeplink",
    "google-analytics",
    "googletagmanager",
    "sentry",
    "facebook",
  ];
  const suspect = WRONG_PATTERNS.find((p) => parsed.url.includes(p));
  if (suspect) {
    console.log(
      `\n⚠️  CAPTURED CURL LOOKS WRONG — URL contains "${suspect}".\n` +
        `   That's not the product-detail XHR; it's an analytics/offers/etc. sidecar.\n` +
        `   In DevTools Network → Fetch/XHR, find the row whose NAME is just the\n` +
        `   numeric product id (e.g. "574"), 200 OK, large response (~10–30 kB).\n` +
        `   Right-click → Copy → Copy as cURL (bash). Then re-run.\n`,
    );
  }

  console.log("\n━━━━━━━━━━ WHAT BLINKIT'S REAL WEB CLIENT SENDS (your cURL) ━━━━━━━━━━");
  console.log(`url:     ${parsed.url}`);
  console.log(`method:  ${parsed.method}`);
  if (parsed.body) {
    console.log(`body:    ${parsed.body.slice(0, 300)}${parsed.body.length > 300 ? "…" : ""}`);
  }
  console.log(`headers (${Object.keys(parsed.headers).length}):`);
  console.log(fmtHeaders(parsed.headers, [...SENSITIVE]));
  console.log(`cookies (${Object.keys(parsed.cookies).length}):`);
  console.log(fmtCookies(parsed.cookies));

  // ────────────────────────────────────────────────────────────
  // Diff: what the real client sends that our adapter doesn't.
  // ────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━ DIFF (real client → our adapter) ━━━━━━━━━━");

  const ourHeaderKeys = new Set(Object.keys(session.headers).map((k) => k.toLowerCase()));
  // Plus the ones the adapter hardcodes.
  for (const h of ["app_client", "app_version", "web_app_version", "device_id", "auth_key", "lat", "lon", "user-agent", "origin", "referer", "accept", "content-type"]) {
    ourHeaderKeys.add(h);
  }

  const realKeys = Object.keys(parsed.headers).map((k) => k.toLowerCase());
  const missingHeaders = realKeys.filter((k) => !ourHeaderKeys.has(k) && !k.startsWith(":") && !["host", "cookie"].includes(k));
  if (missingHeaders.length) {
    console.log("HEADERS the real client sends that we DO NOT:");
    for (const k of missingHeaders) {
      console.log(`  + ${k.padEnd(28)} ${parsed.headers[k].slice(0, 60)}`);
    }
  } else {
    console.log("No missing headers; the adapter covers everything the real client sends.");
  }

  const ourCookieNames = new Set(
    parseCookieStrKeys(session.cookies),
  );
  const realCookieNames = Object.keys(parsed.cookies);
  const missingCookies = realCookieNames.filter((c) => !ourCookieNames.has(c));
  if (missingCookies.length) {
    console.log("\nCOOKIES the real client sends that we DO NOT:");
    for (const c of missingCookies) {
      console.log(`  + ${c}`);
    }
  }

  // The endpoint diff is the most likely culprit.
  console.log("\nENDPOINT URL:");
  console.log(`  adapter assumes:  https://blinkit.com/v1/products/<sku>`);
  console.log(`  real client uses: ${parsed.url}`);
  if (parsed.url && !parsed.url.includes("/v1/products/")) {
    console.log(
      `  ⚠️  MISMATCH. Update lib/grocery/blinkit.ts getProductDetail() to use ` +
        `the real endpoint path/method/body.`,
    );
  }
}

function parseCookieStrKeys(s: string): string[] {
  return s.split(/;\s*/).map((p) => p.split("=")[0].trim()).filter(Boolean);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

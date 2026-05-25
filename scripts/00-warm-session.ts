#!/usr/bin/env -S pnpm tsx
/**
 * Warm a grocery session.
 *
 * THREE MODES (in order of reliability):
 *
 *   1) --playwright   (DEFAULT — the only thing that reliably passes
 *                      Cloudflare bot manager)
 *
 *      Spins up a Chromium window. You sign in, pin a delivery address,
 *      and confirm. We then save:
 *        - .cache/<platform>-storage.json   (cookies + localStorage)
 *        - .cache/<platform>-session.json   (captured XHR headers + lat/lon)
 *      Subsequent scrape scripts use the storage state via a headless
 *      Playwright context — fetches happen INSIDE Chromium so the TLS
 *      handshake matches what Cloudflare's __cf_bm cookie was bound to.
 *
 *   2) --from-curl    (manual; rarely works against Cloudflare-protected
 *                      origins because the captured cURL's TLS context
 *                      doesn't survive replay — kept for emergencies on
 *                      less-aggressive sites)
 *
 *   3) --show         Print what's currently cached.
 */

import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  loadSession,
  platformFromEnv,
  readCookie,
  saveSession,
  sessionFromCurl,
} from "@/lib/grocery";
import type { GrocerySession, Platform } from "@/lib/grocery";

const CACHE_DIR = ".cache";

interface Args {
  mode: "playwright" | "curl" | "show";
  platform: Platform;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let mode: Args["mode"] = "playwright"; // default
  if (argv.includes("--from-curl")) mode = "curl";
  if (argv.includes("--playwright")) mode = "playwright"; // explicit
  if (argv.includes("--show")) mode = "show";

  let platform: Platform = platformFromEnv();
  for (const a of argv) {
    if (a.startsWith("--platform=")) {
      const v = a.split("=")[1] as Platform;
      if (v === "blinkit" || v === "zepto" || v === "swiggy") platform = v;
    }
  }
  return { mode, platform };
}

function baseUrlFor(platform: Platform): string {
  switch (platform) {
    case "blinkit":
      return "https://blinkit.com";
    case "zepto":
      return "https://www.zeptonow.com";
    case "swiggy":
      return "https://www.swiggy.com/instamart";
  }
}

function waitForEnter(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });
}

async function warmFromCurl(platform: Platform): Promise<GrocerySession> {
  const curlPath = path.join(CACHE_DIR, `${platform}-curl.txt`);
  let curl: string;
  try {
    curl = await readFile(curlPath, "utf8");
  } catch {
    throw new Error(
      `[warm-session] ${curlPath} not found.\n` +
        `  Manual cURL mode rarely works against Cloudflare-protected sites.\n` +
        `  Use --playwright instead (it's the default).`,
    );
  }
  const session = sessionFromCurl(platform, curl);
  const lat =
    Number(readCookie(session.cookies, "gr_1_lat")) ||
    Number(readCookie(session.cookies, "lat"));
  const lon =
    Number(readCookie(session.cookies, "gr_1_lon")) ||
    Number(readCookie(session.cookies, "lng")) ||
    Number(readCookie(session.cookies, "lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    session.location = { lat, lng: lon };
  }
  return session;
}

async function warmFromPlaywright(platform: Platform): Promise<GrocerySession> {
  let pw: typeof import("playwright");
  try {
    pw = await import("playwright");
  } catch {
    throw new Error(
      "[warm-session] `playwright` package not installed. Run `pnpm install`.",
    );
  }

  const baseUrl = baseUrlFor(platform);
  await mkdir(CACHE_DIR, { recursive: true });
  const storageStatePath = path.join(CACHE_DIR, `${platform}-storage.json`);

  console.log(`[warm-session] launching Chromium → ${baseUrl}`);
  console.log(
    `  NOTE: if Chromium isn't installed yet, run:\n` +
      `        pnpm exec playwright install chromium\n`,
  );

  const browser = await pw.chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  const page = await context.newPage();

  // Snapshot the headers off every XHR that hits the platform's API. These
  // become our adapter's per-request header set — Playwright handles cookies
  // and TLS via the persistent context, but our adapter still wants to set
  // app_client / app_version / auth_key / referer to match the real client.
  const capturedHeaders: Record<string, string> = {};
  page.on("request", (req) => {
    const url = req.url();
    if (
      url.includes("/v1/") ||
      url.includes("/v2/services/") ||
      url.includes("/v3/")
    ) {
      const h = req.headers();
      for (const [k, v] of Object.entries(h)) {
        if (k.startsWith(":") || k === "cookie") continue;
        if (!capturedHeaders[k]) capturedHeaders[k] = v;
      }
    }
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  console.log(
    `\n[warm-session] Chromium is open. In that window:\n` +
      `  1. Sign in (if needed)\n` +
      `  2. Pin a delivery address — Blinkit gates the catalog on it.\n` +
      `  3. Wait for the home grid to load (a few seconds).\n` +
      `\n  When done, come back here and press ENTER.\n`,
  );
  await waitForEnter("[warm-session] press ENTER to capture and close > ");

  // Save Playwright storage state (cookies + localStorage + indexedDB hints).
  await context.storageState({ path: storageStatePath });

  // Capture lat/lon from cookies if available.
  const cookieJar = await context.cookies();
  let lat: number | undefined;
  let lon: number | undefined;
  for (const c of cookieJar) {
    if (c.name === "gr_1_lat") lat = Number(c.value);
    if (c.name === "gr_1_lon") lon = Number(c.value);
  }

  await browser.close();

  const session: GrocerySession = {
    platform,
    cookies: "", // Playwright owns cookies via storage_state_path now.
    headers: capturedHeaders,
    storage_state_path: storageStatePath,
    warmed_at: new Date().toISOString(),
  };
  if (lat !== undefined && lon !== undefined && Number.isFinite(lat) && Number.isFinite(lon)) {
    session.location = { lat, lng: lon };
  }
  return session;
}

async function main() {
  const { mode, platform } = parseArgs();

  if (mode === "show") {
    const existing = await loadSession(platform);
    if (!existing) {
      console.log(`[warm-session] no session cached for "${platform}".`);
      return;
    }
    console.log(
      `[warm-session] ${platform} session warmed at ${existing.warmed_at}\n` +
        `  headers:           ${Object.keys(existing.headers).length}\n` +
        `  cookies:           ${existing.cookies.split(";").filter(Boolean).length}\n` +
        `  storage_state:     ${existing.storage_state_path ?? "(none)"}\n` +
        `  location:          ${existing.location ? JSON.stringify(existing.location) : "(none)"}`,
    );
    return;
  }

  console.log(`[warm-session] mode=${mode} platform=${platform}`);

  const session =
    mode === "curl"
      ? await warmFromCurl(platform)
      : await warmFromPlaywright(platform);

  await saveSession(session);
  console.log(
    `[warm-session] saved ${Object.keys(session.headers).length} headers + ` +
      `storage_state=${session.storage_state_path ?? "(none)"} → ` +
      `.cache/${platform}-session.json`,
  );
  if (session.location) {
    console.log(`[warm-session] location: ${JSON.stringify(session.location)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

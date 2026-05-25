/**
 * Session persistence for grocery adapters.
 *
 * A "session" is everything we need to send a request that doesn't get
 * 401/403'd: cookie jar + pinned location + UA + platform-specific tokens.
 *
 * We persist to `.cache/<platform>-session.json` (gitignored). Two ways
 * to fill it: `scripts/00-warm-session.ts` automates capture with
 * Playwright; or you can paste a "Copy as cURL" from your real browser
 * into `.cache/<platform>-curl.txt` and run the same script in
 * `--from-curl` mode (no headless browser needed).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { GrocerySession, Platform } from "./types";

const CACHE_DIR = ".cache";

function sessionPath(platform: Platform): string {
  return path.join(CACHE_DIR, `${platform}-session.json`);
}

export async function loadSession(platform: Platform): Promise<GrocerySession | null> {
  try {
    const raw = await readFile(sessionPath(platform), "utf8");
    return JSON.parse(raw) as GrocerySession;
  } catch {
    return null;
  }
}

export async function saveSession(session: GrocerySession): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    sessionPath(session.platform),
    JSON.stringify(session, null, 2),
    "utf8",
  );
}

/**
 * Parse a "Copy as cURL (bash)" string from Chrome DevTools into a session
 * stub. The user can sign into the grocery app in their normal browser,
 * pin a delivery address (this populates location cookies), then on any
 * XHR request in the Network tab → Copy → Copy as cURL.
 */
export function sessionFromCurl(
  platform: Platform,
  curl: string,
): GrocerySession {
  const headers: Record<string, string> = {};
  let cookies = "";

  // -H 'Header-Name: value' or --header
  const headerRegex = /(?:-H|--header)\s+'([^']+)'/g;
  for (const match of curl.matchAll(headerRegex)) {
    const [name, ...rest] = match[1].split(":");
    const value = rest.join(":").trim();
    if (name.trim().toLowerCase() === "cookie") {
      cookies = value;
    } else {
      headers[name.trim()] = value;
    }
  }

  // -b 'cookies=...'
  const cookieFlag = /(?:-b|--cookie)\s+'([^']+)'/.exec(curl);
  if (cookieFlag && !cookies) cookies = cookieFlag[1];

  if (!cookies) {
    throw new Error(
      "[session.sessionFromCurl] Couldn't find a Cookie header. Make sure you copied a fully-formed cURL command from DevTools.",
    );
  }

  return {
    platform,
    cookies,
    headers,
    warmed_at: new Date().toISOString(),
  };
}

/** Returns the value of a specific cookie by name from a Cookie header string. */
export function readCookie(cookies: string, name: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(cookies);
  return m ? decodeURIComponent(m[1]) : null;
}

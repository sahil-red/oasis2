#!/usr/bin/env -S pnpm tsx
/**
 * Spy on what Blinkit's real web client fires when loading any URL.
 *
 *   # Product detail page (SKU shortcut):
 *   pnpm tsx scripts/spy-blinkit.ts 574
 *   pnpm tsx scripts/spy-blinkit.ts 574 --slug=lays-chile-limon-flavour-potato-chips
 *
 *   # Any Blinkit URL (category, homepage, search, etc.):
 *   pnpm tsx scripts/spy-blinkit.ts "https://blinkit.com/cn/snacks/cid/1237/29"
 *   pnpm tsx scripts/spy-blinkit.ts "https://blinkit.com/"
 *
 * Opens a headless Chromium with your saved storage state, navigates to
 * the target URL, logs every XHR Blinkit fires, and writes each JSON
 * response to:
 *
 *   data/raw/spy-<tag>/<url-safe-path>.json
 *
 * Where <tag> is the SKU (for product pages) or the last path segment
 * (for everything else). This is the ground-truth tool: after running it
 * we'll know exactly what endpoint to call and what shape the response
 * has, instead of guessing.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { loadSession } from "@/lib/grocery";

loadEnv({ path: ".env.local" });

interface Args {
  targetUrl: string;
  tag: string;
  headless: boolean;
  waitMs: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let positional = "";
  let slug = "x";
  let headless = true;
  let waitMs = 5_000;
  for (const a of argv) {
    if (a.startsWith("--slug=")) slug = a.split("=")[1];
    else if (a.startsWith("--wait=")) waitMs = Number(a.split("=")[1]);
    else if (a === "--show") headless = false;
    else if (!a.startsWith("--")) positional = a;
  }
  if (!positional) {
    console.error(
      "Usage:\n" +
        "  pnpm tsx scripts/spy-blinkit.ts <sku> [--slug=<slug>]      # product page\n" +
        "  pnpm tsx scripts/spy-blinkit.ts <https://blinkit.com/...>  # any URL\n" +
        "  Flags: [--show] [--wait=ms]",
    );
    process.exit(1);
  }

  let targetUrl: string;
  let tag: string;
  if (/^https?:\/\//i.test(positional)) {
    targetUrl = positional;
    // Derive a usable folder name from the last meaningful URL segment.
    const u = new URL(positional);
    const segs = u.pathname.split("/").filter(Boolean);
    tag = segs.length === 0 ? "home" : segs[segs.length - 1];
  } else {
    // Bare SKU shortcut.
    targetUrl = `https://blinkit.com/prn/${slug}/prid/${positional}`;
    tag = positional;
  }
  // Sanitize tag for use as a directory name.
  tag = tag.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80) || "spy";

  return { targetUrl, tag, headless, waitMs };
}

function urlSafePath(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9_.\-]/g, "_")
    .slice(0, 120);
}

async function main() {
  const { targetUrl, tag, headless, waitMs } = parseArgs();

  const session = await loadSession("blinkit");
  if (!session?.storage_state_path) {
    console.error(
      "[spy] no playwright session at .cache/blinkit-storage.json. Run `pnpm warm-session` first.",
    );
    process.exit(1);
  }

  const pw = await import("playwright");
  const browser = await pw.chromium.launch({
    headless,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    storageState: session.storage_state_path,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();

  const outDir = path.join("data/raw", `spy-${tag}`);
  await mkdir(outDir, { recursive: true });

  // Capture every XHR/Fetch that fires.
  interface Captured {
    url: string;
    method: string;
    status: number;
    contentType: string;
    size: number;
    bodyPreview: string;
    requestBody: string | null;
    headers: Record<string, string>;
    savedTo?: string;
  }
  const captured: Captured[] = [];

  page.on("response", async (resp) => {
    const req = resp.request();
    const url = resp.url();
    if (req.resourceType() !== "fetch" && req.resourceType() !== "xhr") return;
    if (
      /google-analytics|googletagmanager|sentry|doubleclick|facebook|criteo|clarity|datadoghq|newrelic|amplitude/i.test(
        url,
      )
    ) {
      return;
    }
    try {
      const headers = resp.headers();
      const contentType = headers["content-type"] ?? "";
      const buf = await resp.body().catch(() => Buffer.alloc(0));
      const size = buf.byteLength;
      const text = buf.toString("utf8");

      const safe = urlSafePath(url);
      const savedTo = path.join(outDir, `${safe}.json`);
      if (contentType.includes("json") && text.trim()) {
        await writeFile(savedTo, text).catch(() => {});
      }

      // Capture the REQUEST body too — critical for replaying POSTs.
      const requestBody = req.postData();
      if (requestBody) {
        await writeFile(
          path.join(outDir, `${safe}.request.txt`),
          `${req.method()} ${url}\n\n${requestBody}`,
        ).catch(() => {});
      }

      captured.push({
        url,
        method: req.method(),
        status: resp.status(),
        contentType,
        size,
        bodyPreview: text.slice(0, 200).replace(/\s+/g, " "),
        requestBody,
        headers: req.headers(),
        savedTo: contentType.includes("json") ? savedTo : undefined,
      });
    } catch {
      // Some responses can't be read (e.g. already disposed); skip them.
    }
  });

  console.log(`[spy] navigating to ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Give the SPA time to fire lazy XHRs.
  console.log(`[spy] waiting ${waitMs}ms for XHRs to settle…`);
  await page.waitForTimeout(waitMs);

  await browser.close();

  // Sort by size descending — the biggest JSON response is almost always
  // the product detail itself.
  captured.sort((a, b) => b.size - a.size);

  console.log(`\n[spy] ${captured.length} XHR/fetch calls observed (sorted by size desc):\n`);
  for (const c of captured) {
    const tag =
      c.status >= 400
        ? `✗ ${c.status}`
        : c.contentType.includes("json")
          ? `✓ ${c.status} json`
          : `· ${c.status}`;
    console.log(
      `${tag.padEnd(12)} ${c.method.padEnd(5)} ${String(c.size).padStart(7)}B  ${c.url}`,
    );
    if (c.savedTo) console.log(`             → ${c.savedTo}`);
    if (c.bodyPreview && !c.savedTo) console.log(`             ${c.bodyPreview}`);
    if (c.requestBody) {
      const bodyPreview = c.requestBody.slice(0, 250).replace(/\s+/g, " ");
      console.log(`             POST body: ${bodyPreview}${c.requestBody.length > 250 ? "…" : ""}`);
    }
  }

  // Show the top 3 JSON responses by size — those are almost always the
  // interesting "main" data endpoints (product detail, category listing,
  // search result, etc.).
  const candidates = captured.filter(
    (c) => c.status === 200 && c.contentType.includes("json") && c.size > 2_000,
  );
  console.log(``);
  if (candidates.length === 0) {
    console.log(`[spy] no large JSON responses found.`);
    console.log(
      `      Either Blinkit embeds the data in the HTML, or the page uses\n` +
        `      websockets/different URL patterns. Inspect data/raw/spy-${tag}/\n` +
        `      to see what was captured.`,
    );
  } else {
    console.log(`[spy] TOP CANDIDATES (largest JSON responses):`);
    for (const c of candidates.slice(0, 3)) {
      console.log(`         ${c.method} ${c.url}`);
      console.log(`         (${c.size} bytes → ${c.savedTo})`);
      if (c.requestBody) console.log(`         body: ${c.requestBody.slice(0, 200)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

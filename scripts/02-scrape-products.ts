#!/usr/bin/env -S pnpm tsx
/**
 * Paginates every category and persists product summaries + (optionally) detail.
 *
 *   pnpm tsx scripts/02-scrape-products.ts             # summary only, all cats
 *   pnpm tsx scripts/02-scrape-products.ts --detail    # also fetch detail per SKU
 *   pnpm tsx scripts/02-scrape-products.ts --limit-cats=10 --pages-per-cat=2
 *
 * Architecture notes:
 *   • Two-phase by design: the cheap summary listing scrape (~10x faster than
 *     per-SKU detail) builds the universe of SKUs; a separate `--detail` pass
 *     fetches the per-product payload (images, FSSAI #, marketing text).
 *   • Source of truth (decided after spying on Blinkit's PDP API):
 *       - per-100g nutrition  → Blinkit (PRIMARY, populated for almost every
 *                               SKU because FSSAI mandates the table).
 *       - ingredients         → Blinkit when present (high-volume SKUs);
 *                               OCR back-label fills the long tail (Phase 3).
 *       - net qty             → Blinkit's cart_item.unit when present, OCR else.
 *     `products.attributes` is a flat key/value bag of EVERYTHING ELSE the
 *     platform exposed on the PDP (Country of Origin, Diet Preference,
 *     Allergen Information, Shelf Life, Seller, Disclaimer, Type, Flavour, …).
 *     Used purely for display, never for scoring.
 *   • Resumable: we journal each completed (platform, category, cursor) to
 *     `.cache/<platform>-scrape-progress.json` so a crash mid-run resumes from
 *     the next page instead of replaying ~10k requests.
 */

import { mkdir, appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import {
  getAdapter,
  loadSession,
  platformFromEnv,
} from "@/lib/grocery";
import type {
  ScrapedCategory,
  ScrapedProductDetail,
  ScrapedProductSummary,
} from "@/lib/grocery";
import { adminClient } from "@/lib/supabase/admin";

loadEnv({ path: ".env.local" });

const RAW_DIR = "data/raw";
const CACHE_DIR = ".cache";

interface Args {
  detail: boolean;
  detailOnly: boolean;
  dryRun: boolean;
  limitCats: number | null;
  pagesPerCat: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limitCats: number | null = null;
  let pagesPerCat = 100; // safety ceiling — most categories <= 30 pages
  for (const a of argv) {
    if (a.startsWith("--limit-cats=")) limitCats = Number(a.split("=")[1]);
    if (a.startsWith("--pages-per-cat=")) pagesPerCat = Number(a.split("=")[1]);
  }
  const detailOnly = argv.includes("--detail-only");
  return {
    detail: argv.includes("--detail") || detailOnly,
    detailOnly,
    dryRun: argv.includes("--dry-run"),
    limitCats,
    pagesPerCat,
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

interface Progress {
  // category id → last completed cursor (null = done)
  cursors: Record<string, string | null>;
  done: string[];
}

async function loadProgress(platform: string): Promise<Progress> {
  try {
    const raw = await readFile(
      path.join(CACHE_DIR, `${platform}-scrape-progress.json`),
      "utf8",
    );
    return JSON.parse(raw) as Progress;
  } catch {
    return { cursors: {}, done: [] };
  }
}

async function saveProgress(platform: string, p: Progress): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(
    path.join(CACHE_DIR, `${platform}-scrape-progress.json`),
    JSON.stringify(p, null, 2),
  );
}

async function loadDiscoveredCategories(
  platform: string,
): Promise<ScrapedCategory[]> {
  const rawPath = path.join(RAW_DIR, `${platform}-taxonomy.jsonl`);
  const raw = await readFile(rawPath, "utf8").catch(() => "");
  if (!raw.trim()) {
    throw new Error(
      `[02-scrape-products] ${rawPath} is empty. Run scripts/01-scrape-categories.ts first.`,
    );
  }
  return raw
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ScrapedCategory);
}

async function main() {
  const { detail, detailOnly, dryRun, limitCats, pagesPerCat } = parseArgs();
  const platform = platformFromEnv();

  const session = await loadSession(platform);
  if (!session) {
    console.error(
      `[02-scrape-products] no session for "${platform}". ` +
        `Run scripts/00-warm-session.ts first.`,
    );
    process.exit(1);
  }
  if (!session.storage_state_path) {
    console.warn(
      "[02-scrape-products] WARNING: no storage_state_path in session — " +
        "requests will NOT use Playwright and will likely 403. " +
        "Run `pnpm warm-session` (Playwright mode), not --from-curl.",
    );
  } else {
    console.log(
      `[02-scrape-products] playwright session: ${session.storage_state_path} ` +
        `(warmed ${session.warmed_at})`,
    );
  }

  const adapter = getAdapter(platform, {
    rps: Number(process.env.GROCERY_RPS) || 2,
  });

  const categories = await loadDiscoveredCategories(platform);
  const totalCats = limitCats ?? categories.length;
  console.log(
    `[02-scrape-products] platform=${platform}, ` +
      `categories=${totalCats}, detail=${detail}, dryRun=${dryRun}`,
  );

  const supabase = dryRun ? null : adminClient();

  await mkdir(RAW_DIR, { recursive: true });
  const summariesPath = path.join(RAW_DIR, `${platform}-products-summary.jsonl`);
  const detailsPath = path.join(RAW_DIR, `${platform}-products-detail.jsonl`);

  const progress = await loadProgress(platform);

  let scrapedTotal = 0;
  if (detailOnly) {
    console.log("[02-scrape-products] --detail-only: skipping listing phase.");
  }
  for (let ci = 0; detailOnly ? false : ci < totalCats; ci++) {
    const cat = categories[ci];
    if (progress.done.includes(cat.id)) {
      console.log(`[${ci + 1}/${totalCats}] skip "${cat.name}" (already done)`);
      continue;
    }

    let cursor: string | undefined =
      progress.cursors[cat.id] ?? undefined;
    let page = 0;
    let inCategory = 0;

    while (page < pagesPerCat) {
      page++;
      let resp;
      try {
        resp = await adapter.listProducts(session, cat, cursor);
      } catch (err) {
        console.warn(
          `[${ci + 1}/${totalCats}] "${cat.name}" page ${page} failed:`,
          (err as Error).message,
        );
        break;
      }

      for (const p of resp.products) {
        await appendFile(summariesPath, JSON.stringify(p) + "\n");
        inCategory++;
      }

      // Persist summaries in chunks to the DB.
      if (supabase && resp.products.length) {
        const rows = resp.products.map((p) => productSummaryRow(platform, p));
        const { error } = await supabase
          .from("products")
          .upsert(rows, { onConflict: "platform,zepto_sku" });
        if (error) {
          console.error(`[02-scrape-products] upsert error:`, error);
          process.exit(1);
        }
      }

      if (!resp.next_cursor) break;
      cursor = resp.next_cursor;
      progress.cursors[cat.id] = cursor;
      await saveProgress(platform, progress);
    }

    scrapedTotal += inCategory;
    console.log(
      `[${ci + 1}/${totalCats}] "${cat.name}" → +${inCategory} (total ${scrapedTotal})`,
    );
    progress.done.push(cat.id);
    progress.cursors[cat.id] = null;
    await saveProgress(platform, progress);
  }

  console.log(`[02-scrape-products] summary phase done. total products: ${scrapedTotal}`);

  if (!detail) return;

  // ────────────────────────────────────────────────────────────
  // Detail pass: per-SKU fetch with image_urls + barcode + fssai.
  // ────────────────────────────────────────────────────────────
  console.log(`[02-scrape-products] starting --detail pass…`);

  if (!supabase) {
    console.log(
      `[02-scrape-products] --dry-run skips detail pass (it queries DB for SKUs).`,
    );
    return;
  }

  // Pull SKUs that haven't had a PDP fetch yet. We can't use image_urls —
  // the summary pass already sets image_urls from the listing thumb, so
  // every row looks "done" even without ingredients/nutrition/attributes.
  // raw_payload is only written by productDetailUpdate().
  const { data: skuRows, error: skuErr } = await supabase
    .from("products")
    .select("id, zepto_sku")
    .eq("platform", platform)
    .is("raw_payload", null)
    .limit(10_000);
  if (skuErr) {
    console.error(`[02-scrape-products] failed to read pending SKUs:`, skuErr);
    process.exit(1);
  }

  console.log(`[02-scrape-products] detail pending: ${skuRows?.length ?? 0}`);

  let ok = 0;
  let fail = 0;
  let consecutiveCf = 0;

  for (let i = 0; i < (skuRows?.length ?? 0); i++) {
    const row = skuRows![i];
    try {
      const detailResp = await adapter.getProductDetail(session, row.zepto_sku);
      await appendFile(detailsPath, JSON.stringify(detailResp) + "\n");

      const update = productDetailUpdate(detailResp);
      const { error } = await supabase
        .from("products")
        .update(update)
        .eq("id", row.id);
      if (error) console.warn(`detail upsert for ${row.zepto_sku}:`, error);
      ok++;
      consecutiveCf = 0;
    } catch (err) {
      const msg = (err as Error).message;
      const isCf = /403|just a moment|cloudflare/i.test(msg);
      if (isCf) consecutiveCf++;
      fail++;
      console.warn(`detail fail ${row.zepto_sku}: ${msg.slice(0, 120)}`);

      if (consecutiveCf >= 8) {
        console.error(
          "\n[02-scrape-products] 8 Cloudflare blocks in a row — session is stale.\n" +
            "  1. Ctrl+C to stop\n" +
            "  2. Run: pnpm warm-session   (pick location in the browser, press ENTER)\n" +
            "  3. Retry: GROCERY_RPS=1 pnpm tsx scripts/02-scrape-products.ts --detail-only\n" +
            "     (slower rate; resumes SKUs where raw_payload is still null)\n",
        );
        process.exit(1);
      }
    }

    if ((i + 1) % 50 === 0) {
      console.log(
        `[02-scrape-products] detail ${i + 1}/${skuRows!.length}  ok=${ok} fail=${fail}`,
      );
    }
  }
  console.log(`[02-scrape-products] detail results: ok=${ok} fail=${fail}`);
  console.log(`[02-scrape-products] detail phase done.`);
}

function productSummaryRow(
  platform: string,
  p: ScrapedProductSummary,
): Record<string, unknown> {
  return {
    platform,
    zepto_sku: p.sku,
    slug: `${platform}-${slugify(p.brand ?? "")}-${slugify(p.name)}-${p.sku}`,
    name: p.name,
    brand: p.brand,
    super_category: p.super_category,
    category: p.category,
    subcategory: p.subcategory,
    net_weight: p.net_weight,
    price_inr: p.price_inr,
    mrp_inr: p.mrp_inr,
    image_urls: p.thumb_url ? [p.thumb_url] : [],
    product_url: p.product_url,
    updated_at: new Date().toISOString(),
  };
}

function productDetailUpdate(
  d: ScrapedProductDetail,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    image_urls: d.image_urls,
    barcode: d.barcode,
    ingredients_raw: d.ingredients_raw,
    nutrition: d.nutrition,
    attributes: d.attributes,
    raw_payload: d.raw_payload as object,
    updated_at: new Date().toISOString(),
  };
  // Only overwrite the fields below when the detail call actually has them —
  // don't trample whatever the listing scrape captured (which had super/cat
  // context from the URL, while the PDP response is category-agnostic).
  if (d.net_weight) patch.net_weight = d.net_weight;
  if (d.super_category) patch.super_category = d.super_category;
  if (d.category) patch.category = d.category;
  if (d.subcategory) patch.subcategory = d.subcategory;
  return patch;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

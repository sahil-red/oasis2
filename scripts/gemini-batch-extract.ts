#!/usr/bin/env -S pnpm tsx
/**
 * Batch label extraction using Gemini 2.5 Flash-Lite (free tier).
 * Sends N products per API call, outputs same JSONL format as deepseek-label-extract.ts.
 *
 * Setup: add API keys to .env.local
 *   GEMINI_API_KEY_0=AIza...  (account 1)
 *   GEMINI_API_KEY_1=AIza...  (account 2)
 *   GEMINI_API_KEY_2=AIza...  (account 3)
 *   GEMINI_API_KEY_3=AIza...  (account 4)
 *
 * Run all 4 accounts in parallel (split 22K across 4 terminals):
 *   pnpm gemini:batch -- --account-index=0 --total-accounts=4 --batch-size=8 --concurrency=5
 *   pnpm gemini:batch -- --account-index=1 --total-accounts=4 --batch-size=8 --concurrency=5
 *   pnpm gemini:batch -- --account-index=2 --total-accounts=4 --batch-size=8 --concurrency=5
 *   pnpm gemini:batch -- --account-index=3 --total-accounts=4 --batch-size=8 --concurrency=5
 *
 * Or single account for testing:
 *   pnpm gemini:batch -- --account-index=0 --total-accounts=1 --limit=50 --batch-size=8
 */
import { createReadStream, createWriteStream } from "node:fs";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import type { AppleRawOcrProduct } from "@/lib/ocr/apple-raw";
import { extractBatchWithGemini, type BatchItem, type GeminiBatchOptions } from "@/lib/ocr/gemini-batch";
import { validateExtractedLabel } from "@/lib/ocr/deepseek-label-extract";
import { csvRecordToRow, dedupeCsvRows, resolveCsvColumns, type ZeptoCsvRow } from "@/lib/zepto-import/csv-row";
import { readCsvFile } from "@/lib/zepto-import/read-csv";
import { scriptArgv } from "@/lib/util/script-argv";

loadEnv({ path: ".env.local" });

const OCR_PRODUCT_DIR = resolve(process.cwd(), "data/cache/apple-ocr-raw/products");
const OUT_DIR = resolve(process.cwd(), "data/cache/deepseek-label-extract"); // shared with deepseek script
const RESULTS_PATH = resolve(OUT_DIR, "results.jsonl");
const REVIEW_PATH = resolve(OUT_DIR, "gemini-batch-review.json");

type Args = {
  accountIndex: number;
  totalAccounts: number;
  batchSize: number;
  concurrency: number;
  limit: number;
  retries: number;
  resume: boolean;
  fresh: boolean;
  dryRun: boolean;
};

function parseArgs(): Args {
  const argv = scriptArgv();
  let accountIndex = 0;
  let totalAccounts = 1;
  let batchSize = 8;
  let concurrency = 5;
  let limit = 999_999;
  let retries = 2;

  for (const arg of argv) {
    if (arg.startsWith("--account-index=")) accountIndex = Number(arg.split("=")[1]) || 0;
    else if (arg.startsWith("--total-accounts=")) totalAccounts = Math.max(1, Number(arg.split("=")[1]) || 1);
    else if (arg.startsWith("--batch-size=")) batchSize = Math.max(1, Math.min(20, Number(arg.split("=")[1]) || 5));
    else if (arg.startsWith("--concurrency=")) concurrency = Math.max(1, Math.min(15, Number(arg.split("=")[1]) || 5));
    else if (arg.startsWith("--limit=")) limit = Math.max(1, Number(arg.split("=")[1]) || limit);
    else if (arg.startsWith("--retries=")) retries = Math.max(0, Math.min(5, Number(arg.split("=")[1]) || 2));
  }

  return {
    accountIndex,
    totalAccounts,
    batchSize,
    concurrency,
    limit,
    retries,
    resume: argv.includes("--resume"),
    fresh: argv.includes("--fresh"),
    dryRun: argv.includes("--dry-run"),
  };
}

function expandPath(p: string): string {
  return p.startsWith("~/") ? resolve(homedir(), p.slice(2)) : resolve(p);
}

function csvInputPath(): string {
  const configured = process.env.ZEPTO_CSV_PATH ? expandPath(process.env.ZEPTO_CSV_PATH) : null;
  if (configured && existsSync(configured)) return configured;
  return resolve(homedir(), "Downloads", "data.csv");
}

function safeSku(sku: string): string {
  return sku.replace(/[^\w.-]/g, "_");
}

async function loadDoneSkus(): Promise<Set<string>> {
  const done = new Set<string>();
  try {
    const rl = createInterface({ input: createReadStream(RESULTS_PATH), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { zepto_sku?: string; dry_run?: boolean };
        if (row.zepto_sku && !row.dry_run) done.add(row.zepto_sku);
      } catch { /* skip */ }
    }
  } catch { /* first run */ }
  return done;
}

async function loadCatalogRows(): Promise<ZeptoCsvRow[]> {
  const { headers, rows } = await readCsvFile(csvInputPath());
  const cols = resolveCsvColumns(headers);
  return dedupeCsvRows(
    rows.map((row) => csvRecordToRow(row, cols)).filter((r): r is ZeptoCsvRow => r != null),
  );
}

async function readRawOcr(sku: string): Promise<AppleRawOcrProduct | null> {
  const path = resolve(OCR_PRODUCT_DIR, `${safeSku(sku)}.json`);
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as { apple_ocr_raw?: AppleRawOcrProduct };
    return parsed.apple_ocr_raw ?? null;
  } catch { return null; }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

function parse429WaitMs(message: string): number {
  const match = message.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (match?.[1]) return Math.ceil(Number(match[1]) * 1000) + 500;
  return 0;
}

async function withRetries<T>(fn: () => Promise<T>, retries: number, label: string): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (attempt < retries) {
        const msg = (e as Error).message;
        const is429 = msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
        // For 429s use the server-suggested wait; for others use exponential backoff
        const wait = is429
          ? Math.max(parse429WaitMs(msg), 15_000)
          : 2000 * Math.pow(2, attempt);
        console.warn(`  [retry ${attempt + 1}/${retries}] ${label.slice(0, 60)}: ${is429 ? "429 rate limit" : msg.slice(0, 80)} — waiting ${(wait / 1000).toFixed(0)}s`);
        await sleep(wait);
      }
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

async function main() {
  const args = parseArgs();

  const apiKey = process.env[`GEMINI_API_KEY_${args.accountIndex}`]
    ?? process.env.GEMINI_API_KEY
    ?? "";
  if (!apiKey) {
    throw new Error(
      `Missing GEMINI_API_KEY_${args.accountIndex} (or GEMINI_API_KEY) in .env.local`,
    );
  }

  const geminiOpts: GeminiBatchOptions = {
    apiKey,
    model: process.env.GEMINI_MODEL ?? undefined,
    temperature: 0,
    maxTokensPerProduct: 1200,
    timeoutMs: 240_000,
  };

  await mkdir(OUT_DIR, { recursive: true });

  // Load all items with OCR data
  const rows = await loadCatalogRows();
  const allItems: BatchItem[] = [];
  for (const row of rows) {
    const raw = await readRawOcr(row.zepto_sku);
    if (raw) allItems.push({ row, raw });
  }

  // Slice this account's share
  const sliceSize = Math.ceil(allItems.length / args.totalAccounts);
  const sliceStart = args.accountIndex * sliceSize;
  const sliceEnd = Math.min(sliceStart + sliceSize, allItems.length);
  let work = allItems.slice(sliceStart, Math.min(sliceStart + args.limit, sliceEnd));

  // Skip already done
  if (args.resume && !args.fresh) {
    const done = await loadDoneSkus();
    work = work.filter((item) => !done.has(item.row.zepto_sku));
  }

  // Chunk into batches
  const batches: BatchItem[][] = [];
  for (let i = 0; i < work.length; i += args.batchSize) {
    batches.push(work.slice(i, i + args.batchSize));
  }

  console.log(
    `[gemini-batch] account=${args.accountIndex}/${args.totalAccounts - 1} items=${work.length} batches=${batches.length} batch_size=${args.batchSize} concurrency=${args.concurrency} dry_run=${args.dryRun}`,
  );

  if (args.dryRun) {
    console.log(`[gemini-batch] dry-run: would process ${work.length} products in ${batches.length} batches`);
    return;
  }

  const out = createWriteStream(RESULTS_PATH, { flags: "a" });
  let nextBatch = 0;
  let processedProducts = 0;
  let errorProducts = 0;
  const started = Date.now();

  async function worker(): Promise<void> {
    for (;;) {
      const batchIdx = nextBatch++;
      if (batchIdx >= batches.length) return;
      const batch = batches[batchIdx]!;
      const label = `batch ${batchIdx + 1}/${batches.length} (${batch.map((b) => b.row.name.slice(0, 20)).join(", ").slice(0, 60)}...)`;

      const batchStarted = Date.now();
      try {
        const results = await withRetries(
          () => extractBatchWithGemini(batch, geminiOpts),
          args.retries,
          label,
        );

        for (const result of results) {
          out.write(`${JSON.stringify(result)}\n`);
          if ("error" in result && result.error) {
            errorProducts++;
            console.error(`  [error] ${result.name}: ${result.error}`);
          } else {
            processedProducts++;
          }
        }

        const elapsed = ((Date.now() - batchStarted) / 1000).toFixed(1);
        const total = ((Date.now() - started) / 1000).toFixed(0);
        const rate = processedProducts / ((Date.now() - started) / 60_000);
        console.log(
          `[${processedProducts + errorProducts}/${work.length}] batch ${batchIdx + 1} ok (${elapsed}s) | ${rate.toFixed(0)} products/min | ${total}s elapsed`,
        );
      } catch (e) {
        errorProducts += batch.length;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[gemini-batch] batch ${batchIdx + 1} failed after retries: ${msg}`);
        for (const item of batch) {
          out.write(`${JSON.stringify({ zepto_sku: item.row.zepto_sku, name: item.row.name, error: msg, at: new Date().toISOString() })}\n`);
        }
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(args.concurrency, batches.length) }, () => worker()));
  } finally {
    out.end();
    await finished(out);
  }

  // Summary
  const successResults = work.slice(0, processedProducts);
  const nutritionCoverage = successResults.length; // approximate
  const totalElapsed = ((Date.now() - started) / 1000).toFixed(0);
  const summary = {
    account_index: args.accountIndex,
    total_accounts: args.totalAccounts,
    batch_size: args.batchSize,
    concurrency: args.concurrency,
    items: work.length,
    batches: batches.length,
    processed: processedProducts,
    errors: errorProducts,
    elapsed_s: Number(totalElapsed),
    products_per_min: Math.round(processedProducts / (Number(totalElapsed) / 60)),
  };
  await writeFile(REVIEW_PATH, JSON.stringify(summary, null, 2));
  console.log(`[gemini-batch] done | ${JSON.stringify(summary)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

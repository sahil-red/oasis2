#!/usr/bin/env -S pnpm tsx
/**
 * Lossless Apple OCR capture for product images.
 *
 * This stage intentionally does not parse, filter, bucketize, regex-match, or
 * normalize labels. It OCRs every image URL for each product and stores all
 * generated raw Apple Vision outputs for the later LLM extraction stage.
 *
 *   pnpm ocr:apple:raw -- --sku=a5b27839-d7bb-4c42-9687-16ba67ea2d83
 *   pnpm ocr:apple:raw -- --limit=25 --persist-db
 *   pnpm ocr:apple:raw -- --all --resume --persist-db
 */
import { createReadStream, createWriteStream } from "node:fs";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import {
  runAppleRawOcr,
  type AppleOcrVariantMode,
  type AppleRawOcrProduct,
} from "@/lib/ocr/apple-raw";
import { shutdownVisionOcr } from "@/lib/ocr/vision-mac";
import { csvRecordToRow, dedupeCsvRows, resolveCsvColumns } from "@/lib/zepto-import/csv-row";
import { readCsvFile } from "@/lib/zepto-import/read-csv";
import { scriptArgv } from "@/lib/util/script-argv";

loadEnv({ path: ".env.local" });

const OUT_DIR = resolve(process.cwd(), "data/cache/apple-ocr-raw");
const PRODUCT_DIR = resolve(OUT_DIR, "products");
const TEMP_DIR = resolve(process.cwd(), ".tmp/apple-ocr-raw");
const RESULTS_PATH = resolve(OUT_DIR, "results.jsonl");
const DB_FLUSH_SIZE = 20;
const DB_WRITE_CONCURRENCY = 6;
const DB_WRITE_RETRIES = 3;
const MAX_BATCH = 50_000;

type Args = {
  limit: number;
  limitExplicit: boolean;
  all: boolean;
  resume: boolean;
  fresh: boolean;
  persistDb: boolean;
  sku: string | null;
  nameQuery: string | null;
  productConcurrency: number;
  imageConcurrency: number;
  recognitionLevel: "fast" | "accurate";
  variantMode: AppleOcrVariantMode;
  minConfidence: number;
  minTextChars: number;
};

type PendingDbRow = {
  id: string;
  ocr_payload: Record<string, unknown>;
  ocr_image_url: string | null;
  ocr_status: string;
  ocr_attempted_at: string;
  updated_at: string;
};

function parseArgs(): Args {
  const argv = scriptArgv();
  let limit = 100;
  let limitExplicit = false;
  let sku: string | null = null;
  let nameQuery: string | null = null;
  let productConcurrency = 4;
  let imageConcurrency = 4;
  let recognitionLevel: "fast" | "accurate" = "accurate";
  let variantMode: AppleOcrVariantMode = "adaptive";
  let minConfidence = 0.85;
  let minTextChars = 40;

  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      limit = Number(arg.split("=")[1]) || limit;
      limitExplicit = true;
    } else if (arg.startsWith("--sku=")) {
      sku = arg.slice("--sku=".length).trim() || null;
    } else if (arg.startsWith("--name=")) {
      nameQuery = arg.slice("--name=".length).trim() || null;
    } else if (arg.startsWith("--product-concurrency=")) {
      productConcurrency = Math.max(1, Math.min(8, Number(arg.split("=")[1]) || 2));
    } else if (arg.startsWith("--image-concurrency=")) {
      imageConcurrency = Math.max(1, Math.min(8, Number(arg.split("=")[1]) || 2));
    } else if (arg === "--fast") {
      recognitionLevel = "fast";
    } else if (arg === "--accurate") {
      recognitionLevel = "accurate";
    } else if (arg === "--all-variants") {
      variantMode = "all";
    } else if (arg.startsWith("--min-confidence=")) {
      minConfidence = Math.max(0, Math.min(1, Number(arg.split("=")[1]) || minConfidence));
    } else if (arg.startsWith("--min-text-chars=")) {
      minTextChars = Math.max(0, Number(arg.split("=")[1]) || minTextChars);
    }
  }

  return {
    limit: Math.min(limit, MAX_BATCH),
    limitExplicit,
    all: argv.includes("--all"),
    resume: argv.includes("--resume"),
    fresh: argv.includes("--fresh"),
    persistDb: argv.includes("--persist-db"),
    sku,
    nameQuery,
    productConcurrency,
    imageConcurrency,
    recognitionLevel,
    variantMode,
    minConfidence,
    minTextChars,
  };
}

function expandPath(path: string): string {
  return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : resolve(path);
}

function csvInputPath(): string {
  const configured = process.env.ZEPTO_CSV_PATH ? expandPath(process.env.ZEPTO_CSV_PATH) : null;
  if (configured && existsSync(configured)) return configured;
  return resolve(homedir(), "Downloads", "data.csv");
}

function safeSku(sku: string): string {
  return sku.replace(/[^\w.-]/g, "_");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadDoneSkus(): Promise<Set<string>> {
  const done = new Set<string>();
  try {
    const rl = createInterface({
      input: createReadStream(RESULTS_PATH),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as { zepto_sku?: string; error?: string };
        if (row.zepto_sku && !row.error) done.add(row.zepto_sku);
      } catch {
        // Ignore partial/corrupt append lines; the per-SKU JSON remains the source of truth.
      }
    }
  } catch {
    // First run.
  }
  return done;
}

async function loadExistingPayloads(
  skus: string[],
): Promise<Map<string, { id: string; ocr_payload: Record<string, unknown> | null }>> {
  const supabase = adminClient();
  const out = new Map<string, { id: string; ocr_payload: Record<string, unknown> | null }>();
  const CHUNK = 80;
  for (let i = 0; i < skus.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("products")
      .select("id, zepto_sku, ocr_payload")
      .in("zepto_sku", skus.slice(i, i + CHUNK));
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.zepto_sku) {
        out.set(row.zepto_sku as string, {
          id: row.id as string,
          ocr_payload: (row.ocr_payload as Record<string, unknown> | null) ?? null,
        });
      }
    }
  }
  return out;
}

function buildDbPayload(params: {
  prior: Record<string, unknown> | null;
  raw: AppleRawOcrProduct;
  product: { zepto_sku: string; name: string };
}): Record<string, unknown> {
  const previous = params.prior ?? {};
  return {
    backend: "apple_vision_raw",
    raw_capture_only: true,
    extraction_pending: "deepseek_v4_flash",
    generated_at: params.raw.generated_at,
    zepto_sku: params.product.zepto_sku,
    product_name: params.product.name,
    apple_ocr_raw: params.raw,
    previous_label_resolution: previous.label_resolution ?? null,
    previous_regex_payload: previous.regex_payload ?? null,
  };
}

async function main() {
  const args = parseArgs();
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(PRODUCT_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const csvPath = csvInputPath();
  const { headers, rows } = await readCsvFile(csvPath);
  const cols = resolveCsvColumns(headers);
  let work = dedupeCsvRows(
    rows.map((r) => csvRecordToRow(r, cols)).filter((r): r is NonNullable<typeof r> => r != null),
  ).filter((row) => row.image_urls.length > 0);

  if (args.sku) {
    work = work.filter((row) => row.zepto_sku === args.sku);
    if (!work.length) throw new Error(`[apple-ocr-raw] SKU not found in CSV: ${args.sku}`);
  } else if (args.nameQuery) {
    const q = args.nameQuery.toLowerCase();
    work = work.filter((row) => row.name.toLowerCase().includes(q));
    if (!work.length) throw new Error(`[apple-ocr-raw] no CSV rows match --name=${args.nameQuery}`);
  }

  const done =
    args.sku || args.nameQuery || args.fresh
      ? new Set<string>()
      : args.resume
        ? await loadDoneSkus()
        : new Set<string>();
  if (done.size) work = work.filter((row) => !done.has(row.zepto_sku));

  if (args.sku || args.nameQuery) {
    work = work.slice(0, 1);
  } else if (!args.all) {
    work = work.slice(0, args.limit);
  } else if (args.limitExplicit) {
    work = work.slice(0, args.limit);
  }

  const productIds = args.persistDb
    ? await loadExistingPayloads(work.map((row) => row.zepto_sku))
    : new Map<string, { id: string; ocr_payload: Record<string, unknown> | null }>();

  const out = createWriteStream(RESULTS_PATH, { flags: "a" });
  const pending: PendingDbRow[] = [];
  const supabase = args.persistDb ? adminClient() : null;
  let next = 0;
  let processed = 0;
  let errors = 0;
  let dbWritten = 0;
  let dbFailed = 0;

  async function updateRowWithRetry(row: PendingDbRow): Promise<void> {
    if (!supabase) return;
    const { id, ...patch } = row;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= DB_WRITE_RETRIES; attempt++) {
      try {
        const { error } = await supabase.from("products").update(patch).eq("id", id);
        if (!error) {
          dbWritten++;
          return;
        }
        lastError = error;
      } catch (e) {
        lastError = e;
      }
      if (attempt < DB_WRITE_RETRIES) {
        await sleep(500 * Math.pow(2, attempt - 1));
      }
    }
    dbFailed++;
    const message =
      lastError instanceof Error
        ? lastError.message
        : typeof lastError === "object" && lastError && "message" in lastError
          ? String((lastError as { message?: unknown }).message)
          : String(lastError);
    console.warn(`[apple-ocr-raw] db write failed ${id.slice(0, 8)} after ${DB_WRITE_RETRIES} attempts: ${message}`);
  }

  async function flushDb(): Promise<void> {
    if (!supabase || !pending.length) return;
    const batch = pending.splice(0, DB_FLUSH_SIZE);
    for (let i = 0; i < batch.length; i += DB_WRITE_CONCURRENCY) {
      await Promise.all(batch.slice(i, i + DB_WRITE_CONCURRENCY).map(updateRowWithRetry));
    }
    console.log(`[apple-ocr-raw] db flush ${batch.length} (written=${dbWritten} failed=${dbFailed})`);
  }

  console.log(
    `[apple-ocr-raw] products=${work.length} recognition=${args.recognitionLevel} variant_mode=${args.variantMode} product_concurrency=${args.productConcurrency} image_concurrency=${args.imageConcurrency} persist_db=${args.persistDb}`,
  );

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= work.length) return;
      const row = work[index]!;
      const started = Date.now();
      const label = `${row.name.slice(0, 44)} (${row.zepto_sku.slice(0, 8)}...)`;
      try {
        const raw = await runAppleRawOcr({
          imageUrls: row.image_urls,
          tempDir: join(TEMP_DIR, safeSku(row.zepto_sku)),
          recognitionLevel: args.recognitionLevel,
          imageConcurrency: args.imageConcurrency,
          variantMode: args.variantMode,
          minConfidence: args.minConfidence,
          minTextChars: args.minTextChars,
        });
        const productJsonPath = resolve(PRODUCT_DIR, `${safeSku(row.zepto_sku)}.json`);
        await writeFile(
          productJsonPath,
          JSON.stringify(
            {
              zepto_sku: row.zepto_sku,
              name: row.name,
              image_urls: row.image_urls,
              apple_ocr_raw: raw,
            },
            null,
            2,
          ),
          "utf8",
        );
        out.write(
          `${JSON.stringify({
            zepto_sku: row.zepto_sku,
            name: row.name,
            image_count: raw.image_count,
            raw_text_chars: raw.combined_text.length,
            local_json: productJsonPath,
            apple_ocr_raw: raw,
            at: raw.generated_at,
          })}\n`,
        );

        const product = productIds.get(row.zepto_sku);
        if (product) {
          pending.push({
            id: product.id,
            ocr_payload: buildDbPayload({
              prior: product.ocr_payload,
              raw,
              product: { zepto_sku: row.zepto_sku, name: row.name },
            }),
            ocr_image_url: null,
            ocr_status: raw.images.some((image) => image.status === "success")
              ? "success"
              : "failed",
            ocr_attempted_at: raw.generated_at,
            updated_at: raw.generated_at,
          });
          if (pending.length >= DB_FLUSH_SIZE) await flushDb();
        }

        processed++;
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        console.log(
          `[${processed}/${work.length}] ${label} images=${raw.image_count} low_conf=${raw.low_confidence_image_count} chars=${raw.combined_text.length} (${seconds}s)`,
        );
      } catch (e) {
        errors++;
        const error = e instanceof Error ? e.message : String(e);
        out.write(
          `${JSON.stringify({
            zepto_sku: row.zepto_sku,
            name: row.name,
            error,
            at: new Date().toISOString(),
          })}\n`,
        );
        console.error(`[apple-ocr-raw] ${label}: ${error}`);
      }
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(args.productConcurrency, work.length) }, () => worker()),
    );
    await flushDb();
  } finally {
    out.end();
    await finished(out);
    await shutdownVisionOcr();
  }

  console.log(
    `[apple-ocr-raw] done processed=${processed} errors=${errors} db_written=${dbWritten} db_failed=${dbFailed} export=${RESULTS_PATH}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

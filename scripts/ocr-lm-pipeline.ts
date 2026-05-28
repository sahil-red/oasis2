#!/usr/bin/env -S pnpm tsx
/**
 * LiveText OCR → regex vs CSV compare → conditional LM → resolved catalog fields.
 *
 * Cache:  .cache/ocr_raw/${sku}.txt  (text only — no image files kept)
 * Export: data/cache/ocr-lm-pipeline/results.jsonl
 *
 *   pnpm ocr:lm -- --limit=50 --fresh
 *   pnpm ocr:lm -- --all --resume --persist-db
 */
import { createReadStream, createWriteStream } from "node:fs";
import { finished } from "node:stream/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { livetextBestLabel } from "@/lib/ocr/livetext-best-label";
import { shutdownLivetextOcr } from "@/lib/ocr/livetext-mac";
import { structureLabelFromText } from "@/lib/ocr/lm-studio-structure";
import {
  planLabelResolution,
  resolveLabelFields,
  type LabelFieldResolution,
} from "@/lib/ocr/resolve-label-fields";
import { validateStructuredLabel } from "@/lib/ocr/validate-structured-label";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductNutrition } from "@/lib/supabase/types";
import { csvRecordToRow, dedupeCsvRows, resolveCsvColumns } from "@/lib/zepto-import/csv-row";
import { scriptArgv } from "@/lib/util/script-argv";
import { readCsvFile } from "@/lib/zepto-import/read-csv";

loadEnv({ path: ".env.local" });

const MAX_BATCH = 50_000;
const RAW_CACHE_DIR = resolve(process.cwd(), ".cache/ocr_raw");
const OUT_DIR = resolve(process.cwd(), "data/cache/ocr-lm-pipeline");
const RESULTS_PATH = resolve(OUT_DIR, "results.jsonl");
const DB_FLUSH_SIZE = 50;

function parseArgs() {
  const argv = scriptArgv();
  let limit = 100;
  let limitExplicit = false;
  let sku: string | null = null;
  let nameQuery: string | null = null;
  let ocrConcurrency = 4;
  for (const a of argv) {
    if (a.startsWith("--limit=")) {
      limit = Number(a.split("=")[1]) || limit;
      limitExplicit = true;
    }
    if (a.startsWith("--sku=")) sku = a.split("=")[1]?.trim() || null;
    if (a.startsWith("--name=")) nameQuery = a.slice("--name=".length).trim() || null;
    if (a.startsWith("--ocr-concurrency=")) {
      ocrConcurrency = Math.max(1, Math.min(8, Number(a.split("=")[1]) || 4));
    }
  }
  return {
    limit: Math.min(limit, MAX_BATCH),
    limitExplicit,
    all: argv.includes("--all"),
    resume: argv.includes("--resume"),
    fresh: argv.includes("--fresh"),
    forceOcr: argv.includes("--force-ocr"),
    persistDb: argv.includes("--persist-db"),
    dryRun: argv.includes("--dry-run"),
    skipLm: argv.includes("--skip-lm"),
    sku,
    nameQuery,
    ocrConcurrency,
  };
}

function expandPath(p: string): string {
  return p.startsWith("~/") ? resolve(homedir(), p.slice(2)) : resolve(p);
}

function rawCachePath(sku: string): string {
  const safe = sku.replace(/[^\w.-]/g, "_");
  return resolve(RAW_CACHE_DIR, `${safe}.txt`);
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
      const row = JSON.parse(line) as { zepto_sku?: string };
      if (row.zepto_sku) done.add(row.zepto_sku);
    }
  } catch {
    // fresh
  }
  return done;
}

async function readRawCache(sku: string): Promise<string | null> {
  try {
    const text = await readFile(rawCachePath(sku), "utf8");
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

async function writeRawCache(sku: string, text: string): Promise<void> {
  await mkdir(RAW_CACHE_DIR, { recursive: true });
  await writeFile(rawCachePath(sku), text, "utf8");
}

type DbPendingRow = {
  id: string;
  ingredients_raw?: string | null;
  nutrition?: ProductNutrition | null;
  ocr_payload?: Record<string, unknown>;
  ocr_image_url?: string | null;
  ocr_status: string;
  ocr_attempted_at: string;
  updated_at: string;
};

type PipelineResult = {
  zepto_sku: string;
  name: string;
  product_id: string | null;
  image_url: string | null;
  ocr_source: "cache" | "livetext";
  raw_text_chars: number;
  resolution: LabelFieldResolution;
  validation: ReturnType<typeof validateStructuredLabel> | null;
  lm_model: string | null;
  lm_called: boolean;
  at: string;
  error?: string;
};

async function main() {
  const args = parseArgs();
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(RAW_CACHE_DIR, { recursive: true });

  const csvPath = expandPath(
    process.env.ZEPTO_CSV_PATH ?? resolve(homedir(), "Downloads", "data.csv"),
  );
  const { headers, rows } = await readCsvFile(csvPath);
  const cols = resolveCsvColumns(headers);
  const parsed = dedupeCsvRows(
    rows.map((r) => csvRecordToRow(r, cols)).filter((r): r is NonNullable<typeof r> => r != null),
  );

  let work = parsed.filter((r) => r.image_urls.length > 0);

  if (args.sku) {
    work = work.filter((r) => r.zepto_sku === args.sku);
    if (!work.length) throw new Error(`[ocr:lm] SKU not found in CSV: ${args.sku}`);
  } else if (args.nameQuery) {
    const q = args.nameQuery.toLowerCase();
    work = work.filter((r) => r.name.toLowerCase().includes(q));
    if (!work.length) throw new Error(`[ocr:lm] no CSV rows match --name=${args.nameQuery}`);
  }

  const done =
    args.sku || args.nameQuery || args.fresh
      ? new Set<string>()
      : args.resume
        ? await loadDoneSkus()
        : new Set<string>();
  if (done.size) {
    work = work.filter((r) => !done.has(r.zepto_sku));
    console.log(`[ocr:lm] resume: skipping ${done.size} SKUs already in results`);
  }
  if (args.sku || args.nameQuery) {
    work = work.slice(0, 1);
  } else if (!args.all) {
    work = work.slice(0, args.limit);
  } else if (args.limitExplicit) {
    work = work.slice(0, args.limit);
    console.log(`[ocr:lm] --all with --limit=${args.limit}`);
  }
  if (work.length > MAX_BATCH) {
    console.warn(`[ocr:lm] capping batch at ${MAX_BATCH} SKUs`);
    work = work.slice(0, MAX_BATCH);
  }

  const lmModel = process.env.LM_STUDIO_MODEL ?? "qwen2.5coder7b:2";
  const supabase = args.persistDb ? adminClient() : null;
  const skuToId = new Map<string, string>();

  if (supabase && work.length) {
    const skus = work.map((r) => r.zepto_sku);
    const CHUNK = 80;
    for (let i = 0; i < skus.length; i += CHUNK) {
      const chunk = skus.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from("products")
        .select("id, zepto_sku")
        .in("zepto_sku", chunk);
      if (error) throw error;
      for (const row of data ?? []) {
        if (row.zepto_sku) skuToId.set(row.zepto_sku as string, row.id as string);
      }
    }
  }

  const dbPending: DbPendingRow[] = [];

  let dbWritten = 0;
  let dbFailed = 0;
  async function flushDbBatch(): Promise<void> {
    if (!supabase || dbPending.length === 0) return;
    const batch = dbPending.splice(0, DB_FLUSH_SIZE);
    const CONC = 8;
    for (let i = 0; i < batch.length; i += CONC) {
      const slice = batch.slice(i, i + CONC);
      await Promise.all(slice.map(async ({ id, ...patch }) => {
        try {
          const { error } = await supabase.from("products").update(patch).eq("id", id);
          if (error) {
            dbFailed++;
            if (dbFailed <= 3) console.warn(`[ocr:lm] db update ${id.slice(0, 8)}: ${error.message}`);
          } else {
            dbWritten++;
          }
        } catch (e) {
          // Network blip — JSONL is source of truth, retry via ocr:lm:backfill-db
          dbFailed++;
          if (dbFailed <= 3) console.warn(`[ocr:lm] db net err ${id.slice(0, 8)}: ${(e as Error).message}`);
        }
      }));
    }
    console.log(`[ocr:lm] db flush ${batch.length} (written=${dbWritten} failed=${dbFailed} queue=${dbPending.length})`);
  }

  const out = createWriteStream(RESULTS_PATH, { flags: "a" });
  let processed = 0;
  let fatalError: unknown = null;
  let lmSkipped = 0;
  let lmCalled = 0;
  let cacheHits = 0;
  let errors = 0;
  const skuTimings: number[] = [];
  const tRun = Date.now();

  console.log(
    `[ocr:lm] batch=${work.length} raw_cache=${RAW_CACHE_DIR} export=${RESULTS_PATH}`,
  );
  console.log(`[ocr:lm] model=${lmModel} persist_db=${args.persistDb} db_batch=${DB_FLUSH_SIZE}`);
  console.log(`[ocr:lm] ocr_concurrency=${args.ocrConcurrency} skip_lm=${args.skipLm}`);

  // ── Producer-consumer pipeline ────────────────────────────────────────────
  // OCR (CPU/network) and LM (GPU) run in parallel via a bounded queue.
  // Multiple OCR workers feed the queue; one LM worker drains it.

  type OcrItem = {
    row: typeof work[0];
    rawText: string;
    imageUrl: string | null;
    ocrSource: "cache" | "livetext";
    error?: string;
  };

  const QUEUE_MAX = Math.max(args.ocrConcurrency * 2, 8);
  const queue: OcrItem[] = [];
  let nextSkuIdx = 0;
  let producersDone = 0;

  function pickNext(): typeof work[0] | null {
    if (nextSkuIdx >= work.length) return null;
    return work[nextSkuIdx++]!;
  }

  async function ocrWorker(): Promise<void> {
    while (true) {
      // Backpressure: don't run ahead of the LM consumer
      while (queue.length >= QUEUE_MAX) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const row = pickNext();
      if (!row) break;
      const tSku = Date.now();
      const label = `${row.name.slice(0, 40)} (${row.zepto_sku.slice(0, 8)}…)`;
      try {
        let rawText = args.forceOcr ? null : await readRawCache(row.zepto_sku);
        let ocrSource: "cache" | "livetext" = "cache";
        let imageUrl: string | null = null;
        if (rawText) {
          cacheHits++;
        } else if (!args.dryRun) {
          const best = await livetextBestLabel(row.image_urls);
          if (!best) throw new Error("no OCR text from any image");
          rawText = best.text;
          imageUrl = best.imageUrl;
          ocrSource = "livetext";
          await writeRawCache(row.zepto_sku, rawText);
        } else {
          throw new Error("dry-run: missing raw cache");
        }
        queue.push({ row, rawText, imageUrl, ocrSource });
        const elapsed = ((Date.now() - tSku) / 1000).toFixed(1);
        if (process.env.OCR_VERBOSE) {
          console.log(`[ocr] ${label} (${ocrSource}, ${elapsed}s)`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        queue.push({ row, rawText: "", imageUrl: null, ocrSource: "livetext", error: msg });
      }
    }
    producersDone++;
  }

  async function lmConsumer(): Promise<void> {
    while (true) {
      // Wait for items if queue empty + producers still running
      if (queue.length === 0) {
        if (producersDone >= args.ocrConcurrency) break;
        await new Promise((r) => setTimeout(r, 80));
        continue;
      }
      const item = queue.shift()!;
      const { row, rawText, imageUrl, ocrSource, error } = item;
      const label = `${row.name.slice(0, 40)} (${row.zepto_sku.slice(0, 8)}…)`;
      const tSku = Date.now();

      if (error) {
        errors++;
        console.error(`[ocr:lm] ${row.zepto_sku.slice(0, 8)} ${label} OCR ERROR: ${error}`);
        if (!args.dryRun) {
          out.write(`${JSON.stringify({ zepto_sku: row.zepto_sku, name: row.name, error, at: new Date().toISOString() })}\n`);
        }
        continue;
      }

      try {
        const plan = planLabelResolution(
          row.ingredients_raw,
          row.nutrition as ProductNutrition | null,
          rawText,
        );

        let structured = null;
        let validation = null;
        let lmRaw: string | undefined;

        if (plan.lm_called && !args.skipLm) {
          lmCalled++;
          const lm = await structureLabelFromText(rawText);
          structured = lm.structured;
          lmRaw = lm.rawResponse;
          validation = validateStructuredLabel(structured);
        } else {
          lmSkipped++;
        }

        const resolution = resolveLabelFields({
          csvIngredients: row.ingredients_raw,
          csvNutrition: row.nutrition as ProductNutrition | null,
          rawText,
          structured,
          productName: row.name,
        });

        const result: PipelineResult = {
          zepto_sku: row.zepto_sku,
          name: row.name,
          product_id: skuToId.get(row.zepto_sku) ?? null,
          image_url: imageUrl,
          ocr_source: ocrSource,
          raw_text_chars: rawText.length,
          resolution,
          validation,
          lm_model: plan.lm_called ? lmModel : null,
          lm_called: plan.lm_called,
          at: new Date().toISOString(),
        };

        if (!args.dryRun) {
          out.write(`${JSON.stringify({ ...result, lm_raw: lmRaw, label_resolution: { nutrition_source: resolution.nutrition_source, ingredients_source: resolution.ingredients_source, lm_called: resolution.lm_called, lm_skip_reason: resolution.lm_skip_reason, compare: resolution.compare } })}\n`);
        }

        const productId = skuToId.get(row.zepto_sku);
        if (supabase && !args.dryRun && productId) {
          const ocrPayload = {
            backend: "livetext",
            label_resolution: {
              nutrition_source: resolution.nutrition_source,
              ingredients_source: resolution.ingredients_source,
              lm_called: resolution.lm_called,
              lm_skip_reason: resolution.lm_skip_reason,
              compare: resolution.compare,
              validation,
              resolved_at: result.at,
            },
            regex_payload: resolution.regex_payload,
            serving_size: resolution.serving_size,
            raw_text: rawText,
            confidence: resolution.regex_payload.confidence,
          };
          dbPending.push({
            id: productId,
            ocr_payload: ocrPayload,
            ocr_image_url: imageUrl,
            ocr_status: "success",
            ocr_attempted_at: result.at,
            updated_at: result.at,
            ...(resolution.ingredients_raw ? { ingredients_raw: resolution.ingredients_raw } : {}),
            ...(resolution.nutrition ? { nutrition: resolution.nutrition } : {}),
          });
          if (dbPending.length >= DB_FLUSH_SIZE) await flushDbBatch();
        }

        processed++;
        const sec = (Date.now() - tSku) / 1000;
        skuTimings.push(sec);

        // Concise per-SKU log (full block was too noisy with concurrent OCR)
        console.log(
          `[${processed}/${work.length}] ${label} ocr=${ocrSource} lm=${plan.lm_called && !args.skipLm ? "yes" : "skip"} nut=${resolution.nutrition_source} ing=${resolution.ingredients_source} (${sec.toFixed(1)}s)`,
        );
      } catch (e) {
        errors++;
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[ocr:lm] LM ERROR ${label}: ${msg}`);
        if (!args.dryRun) {
          out.write(`${JSON.stringify({ zepto_sku: row.zepto_sku, name: row.name, error: msg, at: new Date().toISOString() })}\n`);
        }
      }
    }
  }

  try {
    const ocrWorkers = Array.from({ length: args.ocrConcurrency }, () => ocrWorker());
    const lm = lmConsumer();
    await Promise.all([...ocrWorkers, lm]);
  } catch (e) {
    fatalError = e;
    console.error("[ocr:lm] fatal:", e instanceof Error ? e.message : e);
  } finally {
    try {
      await flushDbBatch();
    } catch (e) {
      console.error("[ocr:lm] db flush failed:", e instanceof Error ? e.message : e);
      if (!fatalError) fatalError = e;
    }
    out.end();
    await finished(out);
  }

  const elapsedMin = (Date.now() - tRun) / 60000;
  const avgSku =
    skuTimings.length > 0
      ? skuTimings.reduce((a, b) => a + b, 0) / skuTimings.length
      : 0;
  const perMin = elapsedMin > 0 ? processed / elapsedMin : 0;

  console.log("\n── summary ──");
  console.log(`  processed=${processed} errors=${errors} lm_called=${lmCalled} lm_skipped=${lmSkipped}`);
  console.log(
    `  ocr_text_cache_hits=${cacheHits} elapsed=${elapsedMin.toFixed(2)}min (~${perMin.toFixed(1)}/min) avg_sku=${avgSku.toFixed(2)}s`,
  );
  console.log(`  export: ${RESULTS_PATH}`);
  if (fatalError) process.exit(1);
}

main()
  .finally(() => shutdownLivetextOcr())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

#!/usr/bin/env -S pnpm tsx
/**
 * OCR all catalog images (CSV image_links), store payload + comparison audit.
 *
 * Writes:
 *   data/cache/ocr-audit/results.jsonl   — one row per product
 *   data/cache/ocr-audit/rollup.json     — aggregate counts
 *   products.ocr_payload (+ comparison)  — when --persist-db
 *
 *   pnpm ocr:audit -- --limit=100
 *   pnpm ocr:audit -- --resume
 *   pnpm ocr:audit -- --all --persist-db
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import {
  bumpRollup,
  buildOcrCompareSummary,
  emptyRollup,
  type CompareRollup,
  type OcrCompareSummary,
} from "@/lib/ocr/compare-platform";
import { hasLabelKeywords, labelSignalScore } from "@/lib/ocr/label-signals";
import { parseLabelTextToPayload } from "@/lib/ocr/parse-label-text";
import { shutdownVisionOcr, visionOcrFromUrl } from "@/lib/ocr/vision-mac";
import { csvRecordToRow, dedupeCsvRows, resolveCsvColumns } from "@/lib/zepto-import/csv-row";
import { readCsvFile } from "@/lib/zepto-import/read-csv";
import type { OcrPayload } from "@/lib/ocr/types";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

const OUT_DIR = resolve(process.cwd(), "data/cache/ocr-audit");
const RESULTS_PATH = resolve(OUT_DIR, "results.jsonl");
const ROLLUP_PATH = resolve(OUT_DIR, "rollup.json");
const PROGRESS_PATH = resolve(OUT_DIR, "progress.json");

type AuditRow = {
  zepto_sku: string;
  product_id: string | null;
  name: string;
  image_url: string | null;
  label_score: number;
  inference_seconds: number | null;
  images_tried: number;
  no_label: boolean;
  comparison: OcrCompareSummary;
  ocr_backend: string;
  at: string;
};

function parseArgs() {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
  }
  return {
    limit,
    all: argv.includes("--all"),
    resume: argv.includes("--resume"),
    persistDb: argv.includes("--persist-db"),
    dryRun: argv.includes("--dry-run"),
  };
}

function expandPath(p: string): string {
  return p.startsWith("~/") ? resolve(homedir(), p.slice(2)) : resolve(p);
}

async function loadDoneSkus(): Promise<Set<string>> {
  const done = new Set<string>();
  try {
    const rl = createInterface({ input: createReadStream(RESULTS_PATH), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as { zepto_sku: string };
      if (row.zepto_sku) done.add(row.zepto_sku);
    }
  } catch {
    // fresh run
  }
  return done;
}

async function ocrBestLabelFrame(urls: string[]) {
  const ordered = [...urls].reverse();
  let best: {
    payload: OcrPayload;
    imageUrl: string;
    score: number;
    inferenceSeconds: number;
    imagesTried: number;
  } | null = null;
  let imagesTried = 0;
  for (const url of ordered) {
    try {
      imagesTried++;
      const t0 = Date.now();
      const { payload, raw } = await visionOcrFromUrl(url);
      const wallMs = Date.now() - t0;
      const inferenceSeconds = raw.actual_inference_seconds ?? wallMs / 1000;
      const text = raw.full_text ?? payload.raw_text ?? "";
      if (!hasLabelKeywords(text)) continue;
      const score = labelSignalScore(text);
      const merged: OcrPayload = {
        ...parseLabelTextToPayload(text, {
          avgConfidence: raw.avg_confidence,
          rawText: text,
          backend: "vision",
          backendNote: `audit score=${score}`,
        }),
        ...payload,
        raw_text: text,
      };
      if (!best || score > best.score) {
        best = { payload: merged, imageUrl: url, score, inferenceSeconds, imagesTried };
      }
      if (score >= 6) break;
    } catch {
      // try next image
    }
  }
  return best;
}

async function main() {
  const args = parseArgs();
  await mkdir(OUT_DIR, { recursive: true });

  const csvPath = expandPath(process.env.ZEPTO_CSV_PATH ?? resolve(homedir(), "Downloads", "data.csv"));
  const { headers, rows } = await readCsvFile(csvPath);
  const cols = resolveCsvColumns(headers);
  const parsed = dedupeCsvRows(
    rows.map((r) => csvRecordToRow(r, cols)).filter((r): r is NonNullable<typeof r> => r != null),
  );

  let work = parsed.filter((r) => r.image_urls.length > 0);
  if (!args.all) {
    // default: products with any image (same as --all); kept flag for explicitness
  }

  const done = args.resume ? await loadDoneSkus() : new Set<string>();
  if (done.size) {
    work = work.filter((r) => !done.has(r.zepto_sku));
    console.log(`[ocr:audit] resume: skipping ${done.size} already in results.jsonl`);
  }
  if (args.limit) work = work.slice(0, args.limit);

  const supabase = adminClient();
  const skuToDb = new Map<string, { id: string; ingredients_raw: string | null; nutrition: ProductNutrition | null }>();

  const workSkus = work.map((r) => r.zepto_sku);
  console.log(`[ocr:audit] loading DB rows for ${workSkus.length} SKUs…`);
  const tDb = Date.now();
  // Keep .in() chunks small — 500 UUIDs overflows PostgREST header limits.
  const DB_CHUNK = 80;
  for (let offset = 0; offset < workSkus.length; offset += DB_CHUNK) {
    const chunk = workSkus.slice(offset, offset + DB_CHUNK);
    const { data, error } = await supabase
      .from("products")
      .select("id, zepto_sku, ingredients_raw, nutrition")
      .in("zepto_sku", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const sku = row.zepto_sku as string;
      if (sku)
        skuToDb.set(sku, {
          id: row.id as string,
          ingredients_raw: row.ingredients_raw as string | null,
          nutrition: row.nutrition as ProductNutrition | null,
        });
    }
  }
  console.log(`[ocr:audit] DB preload ${((Date.now() - tDb) / 1000).toFixed(1)}s`);

  const ingredientsRollup = emptyRollup();
  const nutritionRollup = emptyRollup();
  let noLabel = 0;
  let processed = 0;
  const speedSamples: number[] = [];

  const out = createWriteStream(RESULTS_PATH, { flags: "a" });

  console.log(`[ocr:audit] work=${work.length} csv=${csvPath} persist_db=${args.persistDb}`);
  const tRun = Date.now();

  for (let i = 0; i < work.length; i++) {
    const row = work[i]!;
    const db = skuToDb.get(row.zepto_sku);
    const label = `${row.name.slice(0, 42)} (${row.zepto_sku.slice(0, 8)}…)`;

    const tSku = Date.now();
    const best = await ocrBestLabelFrame(row.image_urls);
    const skuSec = (Date.now() - tSku) / 1000;
    if (best) speedSamples.push(best.inferenceSeconds);

    if (i % 25 === 0 || i < 5) {
      console.log(
        `[ocr:audit] ${i + 1}/${work.length} ${label} sku_time=${skuSec.toFixed(2)}s infer=${best?.inferenceSeconds?.toFixed(3) ?? "n/a"} imgs=${best?.imagesTried ?? row.image_urls.length}`,
      );
    }
    const comparison = buildOcrCompareSummary(
      db?.ingredients_raw ?? row.ingredients_raw,
      db?.nutrition ?? row.nutrition,
      best?.payload ?? null,
    );

    if (!best) {
      noLabel++;
    }
    bumpRollup(ingredientsRollup, comparison.ingredients);
    bumpRollup(nutritionRollup, comparison.nutrition);

    const auditRow: AuditRow = {
      zepto_sku: row.zepto_sku,
      product_id: db?.id ?? null,
      name: row.name,
      image_url: best?.imageUrl ?? null,
      label_score: best?.score ?? 0,
      inference_seconds: best?.inferenceSeconds ?? null,
      images_tried: best?.imagesTried ?? row.image_urls.length,
      no_label: !best,
      comparison,
      ocr_backend: "vision",
      at: new Date().toISOString(),
    };

    out.write(`${JSON.stringify(auditRow)}\n`);
    processed++;

    if (args.persistDb && !args.dryRun && db?.id && best) {
      const payloadWithComparison = {
        ...best.payload,
        comparison,
        audit_image_url: best.imageUrl,
      };
      await supabase
        .from("products")
        .update({
          ocr_payload: payloadWithComparison,
          ocr_image_url: best.imageUrl,
          ocr_status: "success",
          ocr_attempted_at: new Date().toISOString(),
        })
        .eq("id", db.id);
    }

    if (i > 0 && i % 100 === 0) {
      await writeFile(
        PROGRESS_PATH,
        JSON.stringify({ processed: done.size + i + 1, at: new Date().toISOString() }, null, 2),
      );
    }
  }

  out.end();

  const rollup = {
    at: new Date().toISOString(),
    processed,
    no_label_frame: noLabel,
    ingredients: ingredientsRollup,
    nutrition: nutritionRollup,
    total_in_results: done.size + processed,
  };

  await writeFile(ROLLUP_PATH, JSON.stringify(rollup, null, 2));

  const elapsedMin = (Date.now() - tRun) / 60000;
  const avgInfer =
    speedSamples.length > 0
      ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length
      : 0;
  const perMin = elapsedMin > 0 ? processed / elapsedMin : 0;

  console.log("\n── speed ──");
  console.log(`  processed=${processed} elapsed=${elapsedMin.toFixed(2)}min (~${perMin.toFixed(1)}/min)`);
  console.log(`  avg vision inference=${avgInfer.toFixed(3)}s (n=${speedSamples.length})`);

  console.log("\n── OCR vs existing (this run) ──");
  console.log("Ingredients:", ingredientsRollup);
  console.log("Nutrition:  ", nutritionRollup);
  console.log(`No label keywords in any image: ${noLabel}`);
  console.log(`Results: ${RESULTS_PATH}`);
  console.log(`Rollup:  ${ROLLUP_PATH}`);
}

main()
  .finally(() => shutdownVisionOcr())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

#!/usr/bin/env -S pnpm tsx
/**
 * Promote local DeepSeek label extraction results into product fields.
 *
 *   pnpm label:deepseek:promote -- --dry-run --limit=25
 *   pnpm label:deepseek:promote -- --sku=<zepto_sku> --force
 */
import { createReadStream } from "node:fs";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { config as loadEnv } from "dotenv";
import {
  buildDeepseekPromotionPatch,
  type DeepseekPromotionResult,
} from "@/lib/ocr/deepseek-promote";
import type { DeepseekExtractionResult } from "@/lib/ocr/deepseek-label-extract";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductNutrition } from "@/lib/supabase/types";
import { scriptArgv } from "@/lib/util/script-argv";

loadEnv({ path: ".env.local" });

const RESULTS_PATH = resolve(process.cwd(), "data/cache/deepseek-label-extract/results.jsonl");
const SUMMARY_PATH = resolve(process.cwd(), "data/cache/deepseek-label-extract/promotion-summary.json");
const BATCH_SIZE = 20;

type Args = {
  dryRun: boolean;
  force: boolean;
  onlyOk: boolean;
  limit: number;
  sku: string | null;
  since: string | null;
};

type ProductRow = {
  id: string;
  zepto_sku: string | null;
  product_key: string | null;
  name: string;
  nutrition: ProductNutrition | null;
  ingredients_raw: string | null;
  attributes: Record<string, string> | null;
  ocr_payload: Record<string, unknown> | null;
};

function parseArgs(): Args {
  const argv = scriptArgv();
  let limit = 100;
  let sku: string | null = null;
  let since: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) limit = Math.max(1, Number(arg.split("=")[1]) || limit);
    else if (arg.startsWith("--sku=")) sku = arg.slice("--sku=".length).trim() || null;
    else if (arg.startsWith("--since=")) since = arg.slice("--since=".length).trim() || null;
  }
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    onlyOk: !argv.includes("--force") && !argv.includes("--allow-validation-errors"),
    limit,
    sku,
    since,
  };
}

function safeDate(value: unknown): number {
  const t = Date.parse(String(value ?? ""));
  return Number.isFinite(t) ? t : 0;
}

async function loadCandidates(args: Args): Promise<Array<DeepseekExtractionResult & { local_json?: string }>> {
  if (!existsSync(RESULTS_PATH)) throw new Error(`Missing ${RESULTS_PATH}`);
  const latest = new Map<string, DeepseekExtractionResult & { local_json?: string }>();
  const sinceMs = args.since ? Date.parse(args.since) : 0;
  const rl = createInterface({
    input: createReadStream(RESULTS_PATH),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let row: (DeepseekExtractionResult & { error?: string; dry_run?: boolean; local_json?: string }) | null = null;
    try {
      row = JSON.parse(line) as DeepseekExtractionResult & { error?: string; dry_run?: boolean; local_json?: string };
    } catch {
      continue;
    }
    if (!row.zepto_sku || row.dry_run || row.error) continue;
    if (args.sku && row.zepto_sku !== args.sku) continue;
    if (sinceMs && safeDate(row.at) < sinceMs) continue;
    if (args.onlyOk && row.validation && !row.validation.ok) continue;
    const prev = latest.get(row.zepto_sku);
    if (!prev || safeDate(row.at) >= safeDate(prev.at)) latest.set(row.zepto_sku, row);
  }

  return [...latest.values()]
    .sort((a, b) => safeDate(a.at) - safeDate(b.at))
    .slice(0, args.sku ? 1 : args.limit);
}

async function fetchProductsBatch(
  supabase: ReturnType<typeof adminClient>,
  skus: string[],
): Promise<Map<string, ProductRow>> {
  const map = new Map<string, ProductRow>();
  const chunkSize = 80;
  for (let i = 0; i < skus.length; i += chunkSize) {
    const chunk = skus.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("products")
      .select("id, zepto_sku, product_key, name, nutrition, ingredients_raw, attributes, ocr_payload")
      .in("zepto_sku", chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as ProductRow[]) {
      if (row.zepto_sku) map.set(row.zepto_sku, row);
    }
  }
  return map;
}

function summaryFor(results: DeepseekPromotionResult[], args: Args, missing: string[]) {
  const nutrition = results.filter((r) => r.promoted_nutrition).length;
  const ingredients = results.filter((r) => r.promoted_ingredients).length;
  const compare = results.reduce<Record<string, number>>((acc, row) => {
    acc[`nutrition_${row.compare.nutrition}`] = (acc[`nutrition_${row.compare.nutrition}`] ?? 0) + 1;
    acc[`ingredients_${row.compare.ingredients}`] = (acc[`ingredients_${row.compare.ingredients}`] ?? 0) + 1;
    return acc;
  }, {});
  return {
    at: new Date().toISOString(),
    dry_run: args.dryRun,
    force: args.force,
    candidates: results.length,
    promoted_nutrition: nutrition,
    promoted_ingredients: ingredients,
    missing_products: missing,
    compare_counts: compare,
    skus: results.map((r) => ({
      zepto_sku: r.zepto_sku,
      name: r.name,
      nutrition: r.promoted_nutrition,
      ingredients: r.promoted_ingredients,
      compare: r.compare,
    })),
  };
}

async function main() {
  const args = parseArgs();
  const candidates = await loadCandidates(args);
  const supabase = adminClient();
  const promotions: DeepseekPromotionResult[] = [];
  const missing: string[] = [];
  let checked = 0;

  const skus = candidates.map((c) => c.zepto_sku);
  console.log(`[promote-deepseek] fetching ${skus.length} products from DB...`);
  const productMap = await fetchProductsBatch(supabase, skus);

  for (const result of candidates) {
    checked++;
    const product = productMap.get(result.zepto_sku) ?? null;
    if (!product) {
      missing.push(result.zepto_sku);
      continue;
    }
    const promotion = buildDeepseekPromotionPatch(product, result, {
      force: args.force,
      sourcePath: result.local_json ?? null,
    });
    if (promotion) promotions.push(promotion);
  }

  let updated = 0;
  if (!args.dryRun) {
    for (let i = 0; i < promotions.length; i += BATCH_SIZE) {
      const batch = promotions.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (promotion) => {
          const { error } = await supabase
            .from("products")
            .update(promotion.patch)
            .eq("id", promotion.product_id);
          if (error) throw new Error(error.message);
        }),
      );
      updated += batch.length;
      console.log(`[promote-deepseek] updated=${updated}/${promotions.length}`);
    }
  }

  const summary = summaryFor(promotions, args, missing);
  await mkdir(resolve(SUMMARY_PATH, ".."), { recursive: true });
  await writeFile(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf8");

  console.log(
    `[promote-deepseek] done checked=${checked} candidates=${promotions.length} updated=${args.dryRun ? 0 : updated} missing=${missing.length} dry_run=${args.dryRun} summary=${SUMMARY_PATH}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

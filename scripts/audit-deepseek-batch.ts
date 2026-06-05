#!/usr/bin/env -S pnpm tsx
/**
 * Summarize DeepSeek batch extraction coverage from results.jsonl.
 *
 *   pnpm label:deepseek:audit
 *   pnpm label:deepseek:audit -- --since=2026-06-01
 */
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import type { DeepseekExtractionResult } from "@/lib/ocr/deepseek-label-extract";
import { scriptArgv } from "@/lib/util/script-argv";

const RESULTS_PATH = resolve(process.cwd(), "data/cache/deepseek-label-extract/results.jsonl");

function parseArgs() {
  const argv = scriptArgv();
  let since: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith("--since=")) since = arg.slice("--since=".length).trim() || null;
  }
  return { since };
}

function safeDate(value: unknown): number {
  const t = Date.parse(String(value ?? ""));
  return Number.isFinite(t) ? t : 0;
}

async function main() {
  const { since } = parseArgs();
  if (!existsSync(RESULTS_PATH)) {
    console.error(`Missing ${RESULTS_PATH} — run pnpm label:deepseek first.`);
    process.exit(1);
  }

  const sinceMs = since ? Date.parse(since) : 0;
  const latest = new Map<string, DeepseekExtractionResult & { error?: string }>();

  const rl = createInterface({
    input: createReadStream(RESULTS_PATH),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as DeepseekExtractionResult & { error?: string; dry_run?: boolean };
      if (!row.zepto_sku || row.dry_run) continue;
      if (sinceMs && safeDate(row.at) < sinceMs) continue;
      const prev = latest.get(row.zepto_sku);
      if (!prev || safeDate(row.at) >= safeDate(prev.at)) latest.set(row.zepto_sku, row);
    } catch {
      /* skip */
    }
  }

  const rows = [...latest.values()];
  const ok = rows.filter((r) => !r.error && r.extracted);
  const failed = rows.filter((r) => r.error);

  const countField = (fn: (r: DeepseekExtractionResult) => boolean) =>
    ok.length ? Math.round((ok.filter(fn).length / ok.length) * 1000) / 10 : 0;

  const nutrition = (r: DeepseekExtractionResult) =>
    Object.values(r.extracted.nutrition.per_100g_or_100ml).some((v) => v != null);
  const ingredients = (r: DeepseekExtractionResult) => r.extracted.ingredients.raw_list.length > 0;
  const allergens = (r: DeepseekExtractionResult) =>
    r.extracted.allergens.contains.length > 0 ||
    r.extracted.allergens.may_contain.length > 0 ||
    r.extracted.allergens.free_from_claims.length > 0;
  const usage = (r: DeepseekExtractionResult) =>
    Boolean(
      r.extracted.usage.preparation_instructions?.trim() ||
        r.extracted.usage.serving_suggestion?.trim() ||
        r.extracted.usage.recommended_dosage?.trim(),
    );
  const storage = (r: DeepseekExtractionResult) =>
    Boolean(
      r.extracted.storage_and_shelf_life.storage_instructions?.trim() ||
        r.extracted.storage_and_shelf_life.best_before_format?.trim(),
    );
  const why = (r: DeepseekExtractionResult) => Boolean(r.extracted.why?.trim());
  const chips = (r: DeepseekExtractionResult) => r.extracted.chips.length > 0;
  const marketing = (r: DeepseekExtractionResult) => r.extracted.marketing_claims.length > 0;
  const regulatory = (r: DeepseekExtractionResult) =>
    Boolean(
      r.extracted.regulatory.manufacturer?.trim() ||
        r.extracted.regulatory.fssai_license?.trim() ||
        r.extracted.identity.fssai_license?.trim(),
    );

  console.log({
    total_lines: rows.length,
    success: ok.length,
    errors: failed.length,
    validator_ok_pct: countField((r) => r.validation.ok),
    nutrition_pct: countField(nutrition),
    ingredients_pct: countField(ingredients),
    allergens_pct: countField(allergens),
    usage_how_pct: countField(usage),
    storage_pct: countField(storage),
    why_pct: countField(why),
    chips_pct: countField(chips),
    marketing_claims_pct: countField(marketing),
    regulatory_pct: countField(regulatory),
    results_path: RESULTS_PATH,
    per_sku_dir: resolve(process.cwd(), "data/cache/deepseek-label-extract/products"),
    apple_raw_dir: resolve(process.cwd(), "data/cache/apple-ocr-raw/products"),
  });

  if (failed.length) {
    console.log("\nRecent errors:");
    for (const row of failed.slice(-5)) {
      console.log(`  ${row.zepto_sku}: ${row.error?.slice(0, 120)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

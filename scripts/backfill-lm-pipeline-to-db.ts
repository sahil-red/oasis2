#!/usr/bin/env -S pnpm tsx
/**
 * Upsert LM-resolved nutrition/ingredients from ocr-lm-pipeline results.jsonl into products.
 *
 *   pnpm ocr:lm:backfill-db
 *   pnpm ocr:lm:backfill-db -- --dry-run
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import type { LabelFieldResolution } from "@/lib/ocr/resolve-label-fields";
import { adminClient } from "@/lib/supabase/admin";
import { scriptArgv } from "@/lib/util/script-argv";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

const RESULTS_PATH = resolve(process.cwd(), "data/cache/ocr-lm-pipeline/results.jsonl");
const BATCH = 20;

function parseArgs() {
  const argv = scriptArgv();
  return { dryRun: argv.includes("--dry-run") };
}

function isLmResolved(res: LabelFieldResolution): boolean {
  return res.nutrition_source === "llm" || res.ingredients_source === "llm";
}

type PendingRow = {
  id: string;
  ingredients_raw?: string | null;
  nutrition?: ProductNutrition | null;
  ocr_payload: Record<string, unknown>;
  ocr_image_url?: string | null;
  ocr_status: string;
  ocr_attempted_at: string;
  updated_at: string;
};

async function main() {
  const args = parseArgs();
  const supabase = adminClient();
  const skuToId = new Map<string, string>();
  const pending: PendingRow[] = [];
  let lines = 0;
  let candidates = 0;
  let upserted = 0;
  let skippedNoSku = 0;

  async function flush(): Promise<void> {
    if (!pending.length) return;
    const batch = pending.splice(0, BATCH);
    if (args.dryRun) {
      upserted += batch.length;
      console.log(`[backfill-lm] dry-run would upsert ${batch.length}`);
      return;
    }
    for (const { id, ...patch } of batch) {
      const { error } = await supabase.from("products").update(patch).eq("id", id);
      if (error) throw error;
    }
    upserted += batch.length;
    console.log(`[backfill-lm] upserted ${upserted} (batch=${batch.length})`);
  }

  async function resolveSku(sku: string): Promise<string | null> {
    if (skuToId.has(sku)) return skuToId.get(sku)!;
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .eq("zepto_sku", sku)
      .maybeSingle();
    if (error) throw error;
    const id = (data?.id as string | undefined) ?? null;
    if (id) skuToId.set(sku, id);
    return id;
  }

  const rl = createInterface({
    input: createReadStream(RESULTS_PATH),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    lines++;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (row.error) continue;

    const res = (row.resolution ?? row.label_resolution) as LabelFieldResolution | undefined;
    if (!res || !isLmResolved(res)) continue;
    candidates++;

    const sku = row.zepto_sku as string | undefined;
    if (!sku) continue;

    const id =
      (row.product_id as string | null) ?? (await resolveSku(sku));
    if (!id) {
      skippedNoSku++;
      continue;
    }

    const at = (row.at as string) ?? new Date().toISOString();
    const imageUrl = (row.image_url as string | null) ?? null;

    pending.push({
      id,
      ocr_status: "success",
      ocr_attempted_at: at,
      updated_at: at,
      ocr_image_url: imageUrl,
      ...(res.ingredients_raw ? { ingredients_raw: res.ingredients_raw } : {}),
      ...(res.nutrition ? { nutrition: res.nutrition } : {}),
      ocr_payload: {
        backend: "livetext",
        label_resolution: {
          nutrition_source: res.nutrition_source,
          ingredients_source: res.ingredients_source,
          lm_called: res.lm_called,
          lm_skip_reason: res.lm_skip_reason,
          compare: res.compare,
          backfilled_from: "results.jsonl",
          resolved_at: at,
        },
        regex_payload: res.regex_payload,
        serving_size: res.serving_size,
        confidence: res.regex_payload?.confidence,
      },
    });

    if (pending.length >= BATCH) await flush();
  }

  await flush();

  console.log(
    `[backfill-lm] done lines=${lines} lm_candidates=${candidates} upserted=${upserted} no_product=${skippedNoSku} dry_run=${args.dryRun}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

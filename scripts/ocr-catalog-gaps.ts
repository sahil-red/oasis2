#!/usr/bin/env -S pnpm tsx
/**
 * OCR catalog gaps — PaddleOCR (Python) with validation layer.
 *
 *   pnpm ocr:gaps -- --dry-run --limit=5
 *   pnpm ocr:gaps -- --gaps-only --limit=200
 *   pnpm ocr:gaps -- --platform=zepto --retry-failed
 */
import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { applyOcrToProduct } from "@/lib/ocr/apply-to-product";
import { OcrOrchestrator, shutdownOcr, paddleSummary } from "@/lib/ocr";
import { needsLabelOcr } from "@/lib/nutrition/completeness";
import { persistCoreScore } from "@/lib/scoring/persist-core";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

interface Args {
  limit: number | null;
  dryRun: boolean;
  bypassCache: boolean;
  retryFailed: boolean;
  force: boolean;
  gapsOnly: boolean;
  platform: string | null;
  concurrency: number;
}

interface Row {
  id: string;
  name: string;
  image_urls: string[];
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  net_weight: string | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  let platform: string | null = "zepto";
  let concurrency = 1;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
    if (a.startsWith("--platform=")) platform = a.split("=")[1] || null;
    if (a.startsWith("--concurrency=")) concurrency = Math.max(1, Number(a.split("=")[1]));
  }
  if (argv.includes("--all-platforms")) platform = null;
  return {
    limit,
    dryRun: argv.includes("--dry-run"),
    bypassCache: argv.includes("--bypass-cache"),
    retryFailed: argv.includes("--retry-failed"),
    force: argv.includes("--force"),
    gapsOnly: argv.includes("--gaps-only"),
    platform,
    concurrency,
  };
}

async function main() {
  const args = parseArgs();
  const supabase = adminClient();
  const orch = new OcrOrchestrator(supabase, { bypassCache: args.bypassCache });

  let rows: Row[] = [];

  if (args.gapsOnly) {
    const pageSize = 1000;
    let offset = 0;
    while (true) {
      let q = supabase
        .from("products")
        .select("id, name, image_urls, ingredients_raw, nutrition, net_weight")
        .not("image_urls", "is", null)
        .order("scraped_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (args.platform) q = q.eq("platform", args.platform);
      const { data, error } = await q;
      if (error) {
        console.error("[ocr:gaps] fetch failed:", error.message);
        process.exit(1);
      }
      if (!data?.length) break;
      for (const row of data as Row[]) {
        if (needsLabelOcr(row.ingredients_raw, row.nutrition)) rows.push(row);
      }
      offset += pageSize;
      if (data.length < pageSize) break;
      if (args.limit && rows.length >= args.limit) break;
    }
    if (args.limit) rows = rows.slice(0, args.limit);
  } else {
    const statusFilter = args.retryFailed
      ? ["pending", "failed", "no_label_found"]
      : ["pending"];

    let query = supabase
      .from("products")
      .select("id, name, image_urls, ingredients_raw, nutrition, net_weight")
      .in("ocr_status", statusFilter)
      .not("image_urls", "is", null)
      .order("scraped_at", { ascending: true });

    if (args.platform) query = query.eq("platform", args.platform);
    if (args.limit) query = query.limit(args.limit);
    else query = query.limit(10_000);

    const { data, error } = await query;
    if (error) {
      console.error("[ocr:gaps] fetch failed:", error.message);
      process.exit(1);
    }
    rows = (data ?? []) as Row[];
  }

  if (!rows.length) {
    console.log("[ocr:gaps] nothing to process.");
    return;
  }

  const total = rows.length;
  console.log(
    `[ocr:gaps] processing ${total} products (platform=${args.platform ?? "all"}, gaps_only=${args.gapsOnly}, paddle=${paddleSummary()}, concurrency=${args.concurrency}, dry_run=${args.dryRun})`,
  );

  let applied = 0;
  let gated = 0;
  let skipped = 0;
  let noImages = 0;
  let failed = 0;

  const queue = [...rows];
  const workers = Math.min(args.concurrency, queue.length);

  async function worker(workerId: number): Promise<void> {
    while (queue.length) {
      const row = queue.shift();
      if (!row) break;

      const label = (row.name ?? row.id).slice(0, 48);
      console.log(`[w${workerId}] ${label}`);

      const imageUrls = (row.image_urls ?? []).filter(Boolean);
      if (!imageUrls.length) {
        noImages++;
        if (!args.dryRun) {
          await supabase
            .from("products")
            .update({
              ocr_status: "no_label_found",
              ocr_attempted_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        }
        continue;
      }

      try {
        const result = await orch.ocrProductImages(imageUrls);
        const outcome = applyOcrToProduct(
          {
            ingredients_raw: row.ingredients_raw,
            nutrition: row.nutrition,
            net_weight: row.net_weight,
          },
          result
            ? { payload: result.payload, imageUrl: result.imageUrl }
            : null,
          { force: args.force },
        );

        if (outcome.gate_reason === "platform_complete") skipped++;
        else if (outcome.applied) applied++;
        else gated++;

        if (!args.dryRun) {
          await supabase.from("products").update(outcome.patch).eq("id", row.id);
          const nutrition = (outcome.patch.nutrition ?? row.nutrition) as ProductNutrition | null;
          const ingredients_raw = (outcome.patch.ingredients_raw ?? row.ingredients_raw) as string | null;
          await persistCoreScore(
            supabase,
            {
              id: row.id,
              name: row.name,
              category: null,
              subcategory: null,
              ingredients_raw,
              nutrition,
              attributes: null,
            },
            { force: true },
          );
        } else {
          console.log(
            `         applied=${outcome.applied} gate=${outcome.gate_reason} status=${outcome.ocr_status}`,
          );
        }
      } catch (err) {
        failed++;
        console.warn(`         failed: ${(err as Error).message.slice(0, 100)}`);
        if (!args.dryRun) {
          await supabase
            .from("products")
            .update({
              ocr_status: "failed",
              ocr_attempted_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i + 1)));

  console.log(
    `[ocr:gaps] done applied=${applied} gated=${gated} skipped_platform=${skipped} no_images=${noImages} failed=${failed}`,
  );

  await shutdownOcr();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

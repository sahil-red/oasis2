#!/usr/bin/env -S pnpm tsx
/**
 * OCR Zepto catalog images from CSV image_links / image_urls.
 * Tries each image (last → first); keeps the frame whose text mentions
 * nutrition / nutritional / ingredients.
 *
 *   pnpm ocr:csv -- --limit=20 --dry-run
 *   pnpm ocr:csv -- --limit=500 --apply
 *   pnpm ocr:csv -- --gaps-only --apply   # skip rows with complete platform nutrition
 */
import { resolve } from "node:path";
import { homedir } from "node:os";
import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { applyOcrToProduct } from "@/lib/ocr/apply-to-product";
import { labelSignalScore, hasLabelKeywords } from "@/lib/ocr/label-signals";
import { parseLabelTextToPayload } from "@/lib/ocr/parse-label-text";
import { visionOcrFromUrl } from "@/lib/ocr/vision-mac";
import { isPlatformNutritionComplete, needsLabelOcr } from "@/lib/nutrition/completeness";
import { persistCoreScore } from "@/lib/scoring/persist-core";
import { csvRecordToRow, dedupeCsvRows, resolveCsvColumns } from "@/lib/zepto-import/csv-row";
import { readCsvFile } from "@/lib/zepto-import/read-csv";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { OcrPayload } from "@/lib/ocr/types";

loadEnv({ path: ".env.local" });

type CsvPick = {
  zepto_sku: string;
  name: string;
  image_urls: string[];
};

function parseArgs() {
  const argv = process.argv.slice(2);
  let limit: number | null = null;
  for (const a of argv) {
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
  }
  return {
    limit,
    dryRun: argv.includes("--dry-run"),
    apply: argv.includes("--apply"),
    gapsOnly: argv.includes("--gaps-only"),
    bypassCache: argv.includes("--bypass-cache"),
  };
}

function expandPath(p: string): string {
  return p.startsWith("~/") ? resolve(homedir(), p.slice(2)) : resolve(p);
}

async function ocrBestLabelFrame(
  urls: string[],
): Promise<{ payload: OcrPayload; imageUrl: string; score: number } | null> {
  const ordered = [...urls].reverse();
  let best: { payload: OcrPayload; imageUrl: string; score: number } | null = null;

  for (const url of ordered) {
    try {
      const { payload, raw } = await visionOcrFromUrl(url);
      const text = raw.full_text ?? payload.raw_text ?? "";
      if (!hasLabelKeywords(text)) continue;
      const score = labelSignalScore(text);
      const merged: OcrPayload = {
        ...parseLabelTextToPayload(text, {
          avgConfidence: raw.avg_confidence,
          rawText: text,
          backend: "vision",
          backendNote: `csv_image_scan score=${score}`,
        }),
        ...payload,
        raw_text: text,
      };
      if (!best || score > best.score) {
        best = { payload: merged, imageUrl: url, score };
      }
      if (score >= 6) break;
    } catch (e) {
      console.warn(`         image fail: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  return best;
}

async function main() {
  const args = parseArgs();
  const csvPath = expandPath(process.env.ZEPTO_CSV_PATH ?? resolve(homedir(), "Downloads", "data.csv"));

  console.log(`[ocr:csv] CSV: ${csvPath}`);
  const { headers, rows } = await readCsvFile(csvPath);
  const cols = resolveCsvColumns(headers);
  const parsed = dedupeCsvRows(
    rows.map((r) => csvRecordToRow(r, cols)).filter((r): r is NonNullable<typeof r> => r != null),
  );

  let picks: CsvPick[] = parsed
    .filter((r) => r.image_urls.length > 0)
    .map((r) => ({
      zepto_sku: r.zepto_sku,
      name: r.name,
      image_urls: r.image_urls,
    }));

  if (args.gapsOnly) {
    picks = picks.filter(
      (r) => !isPlatformNutritionComplete(
        parsed.find((p) => p.zepto_sku === r.zepto_sku)?.ingredients_raw ?? null,
        parsed.find((p) => p.zepto_sku === r.zepto_sku)?.nutrition ?? null,
      ),
    );
  }

  if (args.limit) picks = picks.slice(0, args.limit);

  console.log(
    `[ocr:csv] products=${picks.length} gaps_only=${args.gapsOnly} apply=${args.apply} dry_run=${args.dryRun}`,
  );

  const supabase = adminClient();
  const skuToRow = new Map(parsed.map((p) => [p.zepto_sku, p]));

  let labelHits = 0;
  let applied = 0;
  let gated = 0;
  let noLabel = 0;
  let failed = 0;

  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i]!;
    const csvRow = skuToRow.get(pick.zepto_sku);
    const label = `${pick.name.slice(0, 44)} (${pick.zepto_sku.slice(0, 8)}…)`;
    console.log(`[${i + 1}/${picks.length}] ${label}`);

    try {
      const best = await ocrBestLabelFrame(pick.image_urls);
      if (!best) {
        noLabel++;
        console.log("         no nutrition/ingredients text in any image");
        continue;
      }
      labelHits++;
      console.log(
        `         label frame score=${best.score} conf=${best.payload.confidence.overall.toFixed(2)}`,
      );

      if (!args.apply || args.dryRun) continue;

      const { data: existing } = await supabase
        .from("products")
        .select("id, name, category, subcategory, ingredients_raw, nutrition, net_weight, attributes")
        .eq("platform", "zepto")
        .eq("zepto_sku", pick.zepto_sku)
        .maybeSingle();

      if (!existing?.id) {
        console.log("         not in DB — run pnpm catalog:sync first");
        continue;
      }

      const outcome = applyOcrToProduct(
        {
          ingredients_raw: existing.ingredients_raw as string | null,
          nutrition: existing.nutrition as ProductNutrition | null,
          net_weight: existing.net_weight as string | null,
        },
        { payload: best.payload, imageUrl: best.imageUrl },
        // Label-keyword frames are trusted even when Vision confidence is modest.
        { force: true, minOverall: 0.18 },
      );

      await supabase.from("products").update(outcome.patch).eq("id", existing.id);

      const nutrition = (outcome.patch.nutrition ?? existing.nutrition) as ProductNutrition | null;
      const scoreStatus = await persistCoreScore(
        supabase,
        {
          id: existing.id as string,
          name: (existing.name as string) ?? pick.name,
          category: existing.category as string | null,
          subcategory: existing.subcategory as string | null,
          ingredients_raw: (outcome.patch.ingredients_raw ?? existing.ingredients_raw) as string | null,
          nutrition,
          attributes: existing.attributes as Record<string, string> | null,
        },
        { force: true },
      );

      if (outcome.applied) applied++;
      else gated++;
      console.log(`         applied=${outcome.applied} gate=${outcome.gate_reason} score=${scoreStatus}`);
    } catch (e) {
      failed++;
      console.warn(`         error: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  console.log(
    `[ocr:csv] done label_hits=${labelHits} applied=${applied} gated=${gated} no_label=${noLabel} failed=${failed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

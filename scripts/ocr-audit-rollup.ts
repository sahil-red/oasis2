#!/usr/bin/env -S pnpm tsx
/**
 * Recompute rollup.json from data/cache/ocr-audit/results.jsonl
 *   pnpm ocr:rollup
 */
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import {
  bumpRollup,
  emptyRollup,
  type FieldCompareStatus,
  type OcrCompareSummary,
} from "@/lib/ocr/compare-platform";

const RESULTS_PATH = resolve(process.cwd(), "data/cache/ocr-audit/results.jsonl");
const ROLLUP_PATH = resolve(process.cwd(), "data/cache/ocr-audit/rollup.json");

async function main() {
  const ingredientsRollup = emptyRollup();
  const nutritionRollup = emptyRollup();
  let total = 0;
  let noLabel = 0;

  const rl = createInterface({ input: createReadStream(RESULTS_PATH), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {
      no_label: boolean;
      comparison: OcrCompareSummary;
    };
    total++;
    if (row.no_label) noLabel++;
    bumpRollup(ingredientsRollup, row.comparison.ingredients);
    bumpRollup(nutritionRollup, row.comparison.nutrition);
  }

  const rollup = {
    at: new Date().toISOString(),
    total,
    no_label_frame: noLabel,
    ingredients: ingredientsRollup,
    nutrition: nutritionRollup,
  };
  await writeFile(ROLLUP_PATH, JSON.stringify(rollup, null, 2));
  console.log(JSON.stringify(rollup, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

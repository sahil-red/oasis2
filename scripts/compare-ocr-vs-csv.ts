#!/usr/bin/env -S pnpm tsx
/**
 * Compare ocr-audit results.jsonl rows to ZEPTO_CSV_PATH for a few SKUs.
 *   pnpm ocr:compare -- --limit=5
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { config as loadEnv } from "dotenv";
import { parseCsvNutritionCell } from "@/lib/zepto-import/parse-csv-nutrition";
import { readCsvFile } from "@/lib/zepto-import/read-csv";
import { csvRecordToRow, dedupeCsvRows, resolveCsvColumns } from "@/lib/zepto-import/csv-row";

loadEnv({ path: ".env.local" });

const RESULTS = resolve(process.cwd(), "data/cache/ocr-audit/results.jsonl");

function expandPath(p: string): string {
  return p.startsWith("~/") ? resolve(homedir(), p.slice(2)) : resolve(p);
}

async function main() {
  const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 5);
  const csvPath = expandPath(process.env.ZEPTO_CSV_PATH ?? resolve(homedir(), "Downloads", "data.csv"));
  const text = await readFile(RESULTS, "utf8");
  const auditRows = text
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .map((l) => JSON.parse(l) as Record<string, unknown>);

  const { headers, rows } = await readCsvFile(csvPath);
  const cols = resolveCsvColumns(headers);
  const bySku = new Map(
    dedupeCsvRows(
      rows.map((r) => csvRecordToRow(r, cols)).filter((r): r is NonNullable<typeof r> => r != null),
    ).map((r) => [r.zepto_sku, r]),
  );

  for (const a of auditRows) {
    const sku = a.zepto_sku as string;
    const csv = bySku.get(sku);
    console.log("\n" + "═".repeat(72));
    console.log((a.name as string)?.slice(0, 60));
    console.log(`SKU ${sku}`);
    console.log(
      `OCR: label_score=${a.label_score} infer=${a.inference_seconds}s images_tried=${a.images_tried} no_label=${a.no_label}`,
    );
    const cmp = a.comparison as { ingredients: string; nutrition: string };
    console.log(`Compare: ingredients=${cmp.ingredients} nutrition=${cmp.nutrition}`);

    if (!csv) {
      console.log("CSV: row not found");
      continue;
    }

    const csvIng = (csv.ingredients_raw ?? "").slice(0, 200);
    const csvNut = csv.nutrition;
    console.log("\nCSV ingredients:", csvIng || "(empty/null)");
    console.log("CSV nutrition:", csvNut ? JSON.stringify(csvNut).slice(0, 280) : "(empty)");

    const ocrPayload = await fetchOcrText(sku);
    if (ocrPayload) {
      console.log("\nOCR raw text (first 400 chars):");
      console.log(ocrPayload.slice(0, 400).replace(/\n/g, " | "));
    }
  }
}

async function fetchOcrText(sku: string): Promise<string | null> {
  try {
    const { adminClient } = await import("@/lib/supabase/admin");
    const supabase = adminClient();
    const { data } = await supabase
      .from("products")
      .select("ocr_payload")
      .eq("zepto_sku", sku)
      .maybeSingle();
    const p = data?.ocr_payload as { raw_text?: string } | null;
    return p?.raw_text ?? null;
  } catch {
    return null;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env -S pnpm tsx
/**
 * Quick status for long LM jobs (ocr:lm + rate:ingredients).
 *   pnpm lm:status
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";

loadEnv({ path: ".env.local" });

async function countJsonl(path: string): Promise<number> {
  try {
    const text = await readFile(path, "utf8");
    return text.split("\n").filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

async function main() {
  const { execSync } = await import("node:child_process");
  let procs = "";
  try {
    procs = execSync(
      "pgrep -fl 'rate-ingredients|ocr-lm-pipeline' 2>/dev/null || true",
      { encoding: "utf8" },
    ).trim();
  } catch {
    procs = "";
  }

  const ocrResultsPath = resolve("data/cache/ocr-lm-pipeline/results.jsonl");
  const ingredientCheckpoint = resolve("data/cache/rate-ingredients/results.jsonl");
  const jsonlLines = await countJsonl(ocrResultsPath);
  const ingredientLocalLines = await countJsonl(ingredientCheckpoint);

  let rated = 0;
  try {
    const s = adminClient();
    const { count } = await s
      .from("ingredient_intelligence")
      .select("*", { count: "exact", head: true });
    rated = count ?? 0;
  } catch {
    rated = -1;
  }

  console.log("── LM Studio jobs ──");
  if (procs) {
    for (const line of procs.split("\n")) console.log(`  ${line}`);
  } else {
    console.log("  (no rate:ingredients or ocr:lm-pipeline processes)");
  }

  console.log("\n── Progress ──");
  console.log(`  ocr-lm results.jsonl lines: ${jsonlLines}`);
  console.log(`  rate-ingredients checkpoint lines: ${ingredientLocalLines}`);
  console.log(`  ingredient_intelligence rows (db): ${rated >= 0 ? rated : "n/a"}`);
  try {
    const lock = await readFile(resolve(".cache/lm-studio.lock"), "utf8");
    console.log(`\n  lm-studio.lock: held (pid ${lock.split("\n")[0]})`);
  } catch {
    console.log("\n  lm-studio.lock: free");
  }
  console.log("\n  Start ingredients (solo):  pnpm rate:ingredients -- --all --batch-size=8");
  console.log("  Start OCR (solo):          pnpm ocr:lm -- --limit=2000 --resume --persist-db");
  console.log("  Do not run both — they share LM Studio via .cache/lm-studio.lock");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env -S pnpm tsx
/**
 * Re-run LiveText OCR + optional LM structuring on one or more images (no DB write).
 *
 *   pnpm tsx scripts/rerun-ocr-check.ts --url=<image-url>
 *   pnpm tsx scripts/rerun-ocr-check.ts --path=/path/to/crop.png
 *   pnpm tsx scripts/rerun-ocr-check.ts --sku=a5b27839-... --fresh
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { spawn } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLabelTextToPayload } from "@/lib/ocr/parse-label-text";
import { structureLabelFromText } from "@/lib/ocr/lm-studio-structure";
import { resolveLabelFields } from "@/lib/ocr/resolve-label-fields";
import { validateStructuredLabel } from "@/lib/ocr/validate-structured-label";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PYTHON = join(REPO_ROOT, "ocr-pipeline/.venv/bin/python");
const PYTHON = (() => {
  const fromEnv = process.env.OCR_PIPELINE_PYTHON?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return DEFAULT_PYTHON;
})();
const LIVETEXT_SCRIPT = join(REPO_ROOT, "ocr-pipeline/livetext_extract.py");

async function livetextCli(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [LIVETEXT_SCRIPT, imagePath], {
      cwd: join(REPO_ROOT, "ocr-pipeline"),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += String(c);
    });
    child.stderr.on("data", (c) => {
      stderr += String(c);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `livetext exit ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as { ok?: boolean; full_text?: string; error?: string };
        if (!parsed.ok) reject(new Error(parsed.error ?? "livetext failed"));
        else resolve(parsed.full_text ?? "");
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  });
}

async function livetextFromUrl(imageUrl: string): Promise<string> {
  const tmpPath = join(tmpdir(), `scout-livetext-rerun-${Date.now()}.jpg`);
  const res = await fetch(imageUrl, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; ScoutOCR/1.0)" },
  });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  await mkdir(tmpdir(), { recursive: true });
  await writeFile(tmpPath, Buffer.from(await res.arrayBuffer()));
  try {
    return await livetextCli(tmpPath);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

function parseArgs() {
  const url = process.argv.find((a) => a.startsWith("--url="))?.slice(6);
  const pathArg = process.argv.find((a) => a.startsWith("--path="))?.slice(7);
  const skipLm = process.argv.includes("--skip-lm");
  const label = process.argv.find((a) => a.startsWith("--label="))?.slice(8) ?? "image";
  if (!url && !pathArg) {
    throw new Error("Provide --url= or --path=");
  }
  return { url, path: pathArg ? resolve(pathArg) : null, skipLm, label };
}

async function main() {
  const args = parseArgs();

  let rawText: string;
  if (args.path) {
    rawText = await livetextCli(args.path);
  } else {
    rawText = await livetextFromUrl(args.url!);
  }

  const regexPayload = parseLabelTextToPayload(rawText, {
    backend: "vision",
    backendNote: "livetext_rerun",
  });

  let structured = null;
  let lmRaw: string | null = null;
  let validation = null;
  if (!args.skipLm) {
    try {
      const lm = await structureLabelFromText(rawText);
      structured = lm.structured;
      lmRaw = lm.rawResponse;
      validation = validateStructuredLabel(structured);
    } catch (e) {
      lmRaw = e instanceof Error ? e.message : String(e);
    }
  }

  const resolution = resolveLabelFields({
    csvIngredients: "Organic Pasteurized Cow Milk, Organic Curd",
    csvNutrition: null,
    rawText,
    structured,
    productName: "Akshayakalpa Organic Malai Paneer",
  });

  console.log(
    JSON.stringify(
      {
        label: args.label,
        source: args.path ?? args.url,
        raw_text_chars: rawText.length,
        raw_text: rawText,
        regex_confidence: regexPayload.confidence,
        regex_nutrition: regexPayload.nutrition_per_100g ?? null,
        lm_structured: structured,
        lm_validation: validation,
        lm_raw: lmRaw,
        resolved_nutrition: resolution.nutrition,
        nutrition_source: resolution.nutrition_source,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

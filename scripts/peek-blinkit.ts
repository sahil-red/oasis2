#!/usr/bin/env -S pnpm tsx
/**
 * Quick diagnostic: fetch ONE Blinkit product and dump:
 *   • the parsed ScrapedProductDetail (what our adapter extracted)
 *   • the full raw payload     (what Blinkit actually returned)
 *   • a summary line per text_blob key + presence of ingredients_raw + nutrition
 *
 * Usage:
 *   pnpm tsx scripts/peek-blinkit.ts <sku>
 *   pnpm tsx scripts/peek-blinkit.ts https://blinkit.com/prn/x/prid/438103
 *   pnpm tsx scripts/peek-blinkit.ts 438103 12345 67890     # several at once
 *
 * Requires a warmed session at .cache/blinkit-session.json (run `pnpm warm-session`).
 *
 * Output written to data/raw/blinkit-peek-<sku>.json so you can grep/inspect later.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { getAdapter, loadSession } from "@/lib/grocery";

loadEnv({ path: ".env.local" });

function extractSku(input: string): string {
  // Accept either a raw id or a Blinkit URL of the form .../prid/<id>.
  const m = /prid\/(\d+)/i.exec(input);
  return m ? m[1] : input.trim();
}

function summarise(label: string, value: unknown): string {
  if (value == null) return `  ${label}: null`;
  if (typeof value === "string")
    return `  ${label}: ${value.length} chars — ${value.slice(0, 80).replace(/\s+/g, " ")}${value.length > 80 ? "…" : ""}`;
  if (Array.isArray(value)) return `  ${label}: array (${value.length})`;
  if (typeof value === "object")
    return `  ${label}: object (${Object.keys(value as object).length} keys)`;
  return `  ${label}: ${String(value)}`;
}

async function main() {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) {
    console.error(
      "[peek-blinkit] no SKU provided.\n" +
        "  Usage: pnpm tsx scripts/peek-blinkit.ts <sku-or-url> [sku2 …]",
    );
    process.exit(1);
  }

  const session = await loadSession("blinkit");
  if (!session) {
    console.error(
      "[peek-blinkit] no warmed session at .cache/blinkit-session.json.\n" +
        "  Run: pnpm warm-session",
    );
    process.exit(1);
  }

  const adapter = getAdapter("blinkit");
  await mkdir("data/raw", { recursive: true });

  for (const input of inputs) {
    const sku = extractSku(input);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`SKU ${sku}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      const detail = await adapter.getProductDetail(session, sku);

      console.log(`name:           ${detail.name}`);
      console.log(`brand:          ${detail.brand ?? "(null)"}`);
      console.log(`category path:  ${detail.super_category ?? "?"} › ${detail.category ?? "?"} › ${detail.subcategory ?? "?"}`);
      console.log(`net_weight:     ${detail.net_weight ?? "(null)"}`);
      console.log(`barcode:        ${detail.barcode ?? "(null)"}`);
      console.log(`fssai_license:  ${detail.fssai_license ?? "(null)"}`);
      console.log(`image_urls:     ${detail.image_urls.length} images`);
      detail.image_urls.forEach((u, i) => console.log(`  [${i}] ${u}`));

      console.log(``);
      console.log(`── INGREDIENTS (platform-supplied — null means OCR will fill it) ──`);
      console.log(summarise("ingredients_raw", detail.ingredients_raw));

      console.log(``);
      console.log(`── NUTRITION (per 100 g, from Blinkit's PDP) ──`);
      if (!detail.nutrition) {
        console.log("  (none — Blinkit didn't expose a nutrition table for this SKU)");
      } else {
        for (const [k, v] of Object.entries(detail.nutrition)) {
          if (k === "source" || k === "extra") continue;
          console.log(`  ${k.padEnd(28)} ${v}`);
        }
        const extra = (detail.nutrition as Record<string, unknown>).extra as
          | Record<string, unknown>
          | undefined;
        if (extra) {
          console.log(`  ── extra (non-canonical) ──`);
          for (const [k, v] of Object.entries(extra)) {
            console.log(`  ${k.padEnd(28)} ${v}`);
          }
        }
        const source = (detail.nutrition as Record<string, unknown>).source;
        if (source) console.log(`  ── source: ${source}`);
      }

      console.log(``);
      console.log(`── ATTRIBUTES (everything else Blinkit exposed) ──`);
      const attrKeys = Object.keys(detail.attributes);
      if (attrKeys.length === 0) {
        console.log("  (none)");
      } else {
        for (const k of attrKeys) {
          console.log(summarise(k.padEnd(28), detail.attributes[k]));
        }
      }

      console.log(``);
      console.log(`── text_blobs (long-form copy for Phase 3 fallback) ──`);
      const blobKeys = Object.keys(detail.text_blobs);
      if (blobKeys.length === 0) {
        console.log("  (none)");
      } else {
        for (const k of blobKeys) {
          console.log(summarise(k.padEnd(28), detail.text_blobs[k]));
        }
      }

      const outPath = path.join("data/raw", `blinkit-peek-${sku}.json`);
      await writeFile(
        outPath,
        JSON.stringify(
          {
            parsed: detail,
            raw_payload: detail.raw_payload,
          },
          null,
          2,
        ),
      );
      console.log(``);
      console.log(`Full dump → ${outPath}`);
    } catch (err) {
      console.error(`[peek-blinkit] sku ${sku} failed: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

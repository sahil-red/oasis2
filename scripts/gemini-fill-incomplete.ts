#!/usr/bin/env -S pnpm tsx
/**
 * Gemini text fill for all catalog rows still missing complete nutrition/ingredients.
 * Batches ~10 SKUs per API call (GEMINI_TEXT_BATCH_SIZE).
 *
 *   pnpm gemini:fill
 *   pnpm gemini:fill -- --platform=zepto --limit=500
 *   pnpm gemini:fill -- --dry-run
 */
import { config as loadEnv } from "dotenv";
import { isPlatformNutritionComplete } from "@/lib/nutrition/completeness";
import { buildProductFillContext } from "@/lib/nutrition/fill-context";
import {
  GEMINI_TEXT_BATCH_SIZE,
  geminiTextFillBatch,
  type TextFillInput,
} from "@/lib/nutrition/gemini-text-fill";
import { persistCoreScore, hasScoreableNutrition } from "@/lib/scoring/persist-core";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

type Row = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  platform: string;
  category: string | null;
  subcategory: string | null;
  net_weight: string | null;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  attributes: Record<string, string> | null;
  raw_payload: Record<string, unknown> | null;
};

function parseArgs() {
  const argv = process.argv.slice(2);
  let platform: "all" | "blinkit" | "zepto" = "all";
  let limit = 0;
  let batchSize = GEMINI_TEXT_BATCH_SIZE;
  for (const a of argv) {
    if (a.startsWith("--platform=")) {
      const v = a.split("=")[1];
      if (v === "blinkit" || v === "zepto" || v === "all") platform = v;
    }
    if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
    if (a.startsWith("--batch=")) batchSize = Number(a.split("=")[1]);
  }
  return {
    dryRun: argv.includes("--dry-run"),
    platform,
    limit,
    batchSize,
  };
}

async function fetchIncomplete(args: ReturnType<typeof parseArgs>): Promise<Row[]> {
  const supabase = adminClient();
  const out: Row[] = [];
  const pageSize = 200;
  let offset = 0;

  while (true) {
    let q = supabase
      .from("products")
      .select(
        "id, slug, name, brand, platform, category, subcategory, net_weight, ingredients_raw, nutrition, attributes, raw_payload",
      )
      .not("raw_payload", "is", null)
      .order("updated_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (args.platform !== "all") q = q.eq("platform", args.platform);

    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data as Row[]) {
      if (!isPlatformNutritionComplete(row.ingredients_raw, row.nutrition)) {
        out.push(row);
        if (args.limit > 0 && out.length >= args.limit) return out;
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
    if (offset > 20_000) break;
  }

  return out;
}

function toFillInput(row: Row): TextFillInput {
  const attrs = (row.attributes ?? {}) as Record<string, string>;
  return {
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    subcategory: row.subcategory,
    net_weight: row.net_weight,
    context: buildProductFillContext(attrs, row.raw_payload, row.platform),
    partial_nutrition: row.nutrition,
    partial_ingredients: row.ingredients_raw,
    attributes: attrs,
  };
}

async function main() {
  const args = parseArgs();
  const rows = await fetchIncomplete(args);
  console.log(
    `[gemini-fill] ${rows.length} incomplete (platform=${args.platform}, batch=${args.batchSize})`,
  );
  if (rows.length === 0) {
    console.log("[gemini-fill] nothing to fill.");
    return;
  }

  if (args.dryRun) {
    for (const r of rows.slice(0, 20)) {
      console.log(`  ${r.platform} · ${r.name.slice(0, 50)}`);
    }
    if (rows.length > 20) console.log(`  … and ${rows.length - 20} more`);
    return;
  }

  const supabase = adminClient();
  const queue = rows.map(toFillInput);
  let filled = 0;
  let scored = 0;

  for (let i = 0; i < queue.length; i += args.batchSize * 5) {
    const chunk = queue.slice(i, i + args.batchSize * 5);
    const results = await geminiTextFillBatch(chunk, args.batchSize);
    for (const item of results) {
      const row = rows.find((r) => r.slug === item.slug);
      if (!row) continue;

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (item.nutrition) patch.nutrition = item.nutrition;
      if (item.ingredients_raw) patch.ingredients_raw = item.ingredients_raw;

      const { error } = await supabase.from("products").update(patch).eq("id", row.id);
      if (error) {
        console.warn(`[gemini-fill] ${item.slug}: ${error.message}`);
        continue;
      }
      filled++;
      console.log(
        `[gemini-fill] ${item.slug} conf=${item.confidence.toFixed(2)} nutrition=${Boolean(item.nutrition)}`,
      );

      if (item.nutrition && hasScoreableNutrition(item.nutrition)) {
        const r = await persistCoreScore(
          supabase,
          {
            id: row.id,
            name: row.name,
            category: row.category,
            subcategory: row.subcategory,
            ingredients_raw: (item.ingredients_raw ?? row.ingredients_raw) as string | null,
            nutrition: item.nutrition,
            attributes: row.attributes,
          },
          { force: true },
        );
        if (r === "scored") scored++;
      }
    }
    console.log(
      `[gemini-fill] progress ${Math.min(i + chunk.length, queue.length)}/${queue.length} filled=${filled} scored=${scored}`,
    );
  }

  console.log(`[gemini-fill] done. filled=${filled} scored=${scored}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env -S pnpm tsx
/**
 * Single source of truth: ~/Downloads/data.csv (~24k Zepto SKUs)
 *
 * 1. Parse CSV (product_variant_id), drop Zepto Cafe
 * 2. Resolve images via BFF product-detail (cached)
 * 3. Upsert all rows, purge everything not in CSV
 * 4. Produce seed → Gemini text fill → score (no OCR)
 *
 *   pnpm catalog:sync
 *   pnpm catalog:sync -- --dry-run
 *   pnpm catalog:sync -- --skip-images
 *   pnpm catalog:sync -- --skip-gemini
 */
import { homedir } from "node:os";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { detectCatalogDbSchema, l3FromRow } from "@/lib/catalog/db-schema";
import { isPlatformNutritionComplete } from "@/lib/nutrition/completeness";
import { matchProduce, produceLabelHint, produceToNutrition } from "@/lib/produce/seed";
import {
  csvRecordToRow,
  dedupeCsvRows,
  resolveCsvColumns,
} from "@/lib/zepto-import/csv-row";
import {
  loadVariantImageCache,
  resolveVariantImages,
} from "@/lib/zepto-import/fetch-variant-images";
import { mergeCsvWithExisting } from "@/lib/zepto-import/merge-row";
import { readCsvFile } from "@/lib/zepto-import/read-csv";
import { buildProductFillContext } from "@/lib/nutrition/fill-context";
import {
  geminiTextFillBatch,
  type TextFillInput,
} from "@/lib/nutrition/gemini-text-fill";
import { reconcileNutrition } from "@/lib/nutrition/sanity";
import { persistCoreScore, hasScoreableNutrition } from "@/lib/scoring/persist-core";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

const PRODUCE_RE =
  /fruit|vegetable|herb|leaf|onion|tomato|potato|banana|apple|mango|grape|berry|spinach|coriander|mint|broccoli|cauliflower|capsicum|carrot|beetroot|lemon|orange|papaya|guava|pear|pineapple|watermelon|pomegranate|drumstick|beans|peas|mushroom|cabbage|cucumber|ginger|garlic|chilli|chili|lettuce|avocado|kiwi|melon|sapota|cherry|plum|peach|apricot|fig|jackfruit|custard|beet|radish|turnip|sweet corn|baby corn/i;

const PROTEIN_RE =
  /chicken|fish|mutton|lamb|prawn|shrimp|crab|egg\b|eggs\b|paneer|tofu|whey|protein powder|protein\b|salmon|rohu|pomfret|keema|sausage|bacon|turkey|duck\b|meat\b|seafood|fillet|breast|drumstick|curry cut|boneless/i;

async function defaultCsvPath(): Promise<string> {
  const p = resolve(homedir(), "Downloads", "data.csv");
  await access(p);
  return p;
}

type ExistingRow = {
  id: string;
  zepto_sku?: string | null;
  image_urls: string[] | null;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  attributes: Record<string, string> | null;
};

async function loadExistingByVariant(
  supabase: ReturnType<typeof adminClient>,
): Promise<Map<string, ExistingRow>> {
  const map = new Map<string, ExistingRow>();
  let offset = 0;
  const page = 500;
  for (;;) {
    const { data, error } = await supabase
      .from("products")
      .select("id, zepto_sku, image_urls, ingredients_raw, nutrition, attributes")
      .eq("platform", "zepto")
      .range(offset, offset + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const sku = row.zepto_sku as string | null;
      if (sku) map.set(sku, row as ExistingRow);
    }
    if (data.length < page) break;
    offset += page;
  }
  return map;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const skipImages = argv.includes("--skip-images");
  const skipGemini = argv.includes("--skip-gemini");
  const skipScore = argv.includes("--skip-score");
  const pathArg = argv.find((a) => !a.startsWith("--") && a.endsWith(".csv"));
  const csvPath = pathArg ? resolve(pathArg) : await defaultCsvPath();

  console.log(`[catalog:sync] CSV: ${csvPath}`);
  const { headers, rows: rawRows } = await readCsvFile(csvPath);
  const cols = resolveCsvColumns(headers);
  const parsedRaw = rawRows
    .map((r) => csvRecordToRow(r, cols))
    .filter((r): r is NonNullable<typeof r> => r != null);

  const parsed = dedupeCsvRows(parsedRaw);
  const cafeSkipped = rawRows.length - parsedRaw.length;
  console.log(
    `[catalog:sync] parsed=${parsedRaw.length} unique=${parsed.length} skipped=${rawRows.length - parsedRaw.length} (invalid/cafe) cafe≈${cafeSkipped}`,
  );

  const allowedSkus = new Set(parsed.map((p) => p.zepto_sku));
  const supabase = adminClient();
  const schema = await detectCatalogDbSchema(supabase);

  const imageCache = await loadVariantImageCache();
  console.log(`[catalog:sync] image cache: ${imageCache.size} variants`);
  const resolvedImages = await resolveVariantImages({
    variantIds: parsed.map((p) => p.zepto_sku),
    cache: imageCache,
    skipFetch: skipImages || dryRun,
  });

  const existingBySku = await loadExistingByVariant(supabase);

  let completeAtImport = 0;
  let withImages = 0;
  const batchSize = 80;
  for (let i = 0; i < parsed.length; i += batchSize) {
    const batch = parsed.slice(i, i + batchSize);
    const payloads = batch.map((row) => {
      const existing = existingBySku.get(row.zepto_sku) ?? null;
      const bffImages = resolvedImages.get(row.zepto_sku) ?? [];
      const merged = mergeCsvWithExisting(row, existing, bffImages);
      if (merged.image_urls.length) withImages++;
      if (isPlatformNutritionComplete(merged.ingredients_raw, merged.nutrition)) {
        completeAtImport++;
      }

      const payload: Record<string, unknown> = {
        platform: "zepto",
        zepto_sku: row.zepto_sku,
        slug: row.slug,
        name: row.name,
        brand: row.brand,
        super_category: row.super_category,
        category: row.category,
        subcategory: row.subcategory,
        net_weight: row.pack_size,
        mrp_inr: row.mrp_inr,
        ingredients_raw: merged.ingredients_raw,
        nutrition: merged.nutrition,
        image_urls: merged.image_urls,
        product_url: row.product_url,
        raw_payload: null,
        attributes: merged.attributes,
        ocr_status: "skipped",
        updated_at: new Date().toISOString(),
      };
      if (schema.hasProductKey) payload.product_key = row.product_key;
      if (schema.hasL3Category) payload.l3_category = row.l3_category;
      if (schema.hasDataSource) payload.data_source = "csv";
      return payload;
    });

    if (dryRun) continue;

    const onConflict = schema.hasProductKey ? "product_key" : "platform,zepto_sku";
    const { error } = await supabase.from("products").upsert(payloads, { onConflict });
    if (error) {
      console.error("[catalog:sync] upsert failed:", error.message);
      process.exit(1);
    }
    if ((i + batch.length) % 800 === 0 || i + batch.length >= parsed.length) {
      console.log(`[catalog:sync] upserted ${Math.min(i + batch.length, parsed.length)}/${parsed.length}`);
    }
  }

  console.log(
    `[catalog:sync] import: complete=${completeAtImport} with_images=${withImages} dryRun=${dryRun}`,
  );

  if (!dryRun) {
    let purged = 0;
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("products")
        .select("id, zepto_sku, platform")
        .range(offset, offset + 499);
      if (error) throw error;
      if (!data?.length) break;
      const toDelete = data.filter((r) => {
        const sku = r.zepto_sku as string | null;
        return r.platform !== "zepto" || !sku || !allowedSkus.has(sku);
      });
      if (toDelete.length) {
        await supabase.from("products").delete().in("id", toDelete.map((r) => r.id));
        purged += toDelete.length;
        offset = 0;
        continue;
      }
      if (data.length < 500) break;
      offset += 500;
    }
    console.log(`[catalog:sync] purged ${purged} products not in CSV`);
  }

  if (dryRun) {
    console.log("[catalog:sync] dry-run complete.");
    return;
  }

  const skuList = [...allowedSkus];

  // ── Produce seed ──
  let produceOk = 0;
  for (let k = 0; k < skuList.length; k += 200) {
    const chunk = skuList.slice(k, k + 200);
    const { data: produceRows } = await supabase
      .from("products")
      .select("id, name, category, subcategory, attributes, ingredients_raw, nutrition")
      .in("zepto_sku", chunk);

    for (const row of produceRows ?? []) {
      if (isPlatformNutritionComplete(row.ingredients_raw, row.nutrition as ProductNutrition | null)) {
        continue;
      }
      const l3 = l3FromRow(row as { attributes?: Record<string, string> | null; subcategory?: string | null });
      const blob = `${row.name} ${row.category} ${row.subcategory} ${l3 ?? ""}`;
      if (!PRODUCE_RE.test(blob)) continue;
      const entry = matchProduce(row.name as string);
      if (!entry) continue;
      const nutrition = produceToNutrition(entry);
      const ingredients_raw =
        (row.ingredients_raw as string | null)?.trim() ||
        `${produceLabelHint(entry)}: ${entry.id.replace(/-/g, " ")}.`;
      await supabase
        .from("products")
        .update({ nutrition, ingredients_raw, ocr_status: "success" })
        .eq("id", row.id);
      produceOk++;
    }
  }
  console.log(`[catalog:sync] produce seed: ${produceOk}`);

  // ── Gemini (protein + remaining gaps) ──
  if (!skipGemini) {
    const queue: TextFillInput[] = [];
    const rowBySlug = new Map<string, Record<string, unknown>>();
    for (let k = 0; k < skuList.length; k += 200) {
      const chunk = skuList.slice(k, k + 200);
      const { data: gapRows } = await supabase
        .from("products")
        .select(
          "id, slug, name, brand, category, subcategory, net_weight, ingredients_raw, nutrition, attributes",
        )
        .in("zepto_sku", chunk);

      for (const row of gapRows ?? []) {
        if (isPlatformNutritionComplete(row.ingredients_raw, row.nutrition as ProductNutrition | null)) {
          continue;
        }
        const blob = `${row.name} ${row.category} ${row.subcategory}`;
        const attrs = (row.attributes ?? {}) as Record<string, string>;
        const contextParts = [
          buildProductFillContext(attrs, null, "zepto"),
          row.ingredients_raw ? `Partial ingredients: ${row.ingredients_raw}` : "",
          PROTEIN_RE.test(blob) ? "Category hint: raw animal protein or protein supplement" : "",
        ].filter(Boolean);
        queue.push({
          slug: row.slug as string,
          name: row.name as string,
          brand: row.brand as string | null,
          category: row.category as string | null,
          subcategory: row.subcategory as string | null,
          net_weight: row.net_weight as string | null,
          context: contextParts.join("\n"),
          partial_nutrition: row.nutrition as ProductNutrition | null,
          partial_ingredients: row.ingredients_raw as string | null,
          attributes: attrs,
        });
        rowBySlug.set(row.slug as string, row);
      }
    }

    console.log(`[catalog:sync] Gemini queue: ${queue.length}`);
    const filled = await geminiTextFillBatch(queue);
    let geminiOk = 0;
    for (const item of filled) {
      const row = rowBySlug.get(item.slug);
      if (!row) continue;
      const nutrition = reconcileNutrition({
        nutrition: item.nutrition,
        attributes: row.attributes as Record<string, string>,
        name: row.name as string,
        category: row.category as string | null,
        net_weight: row.net_weight as string | null,
      });
      if (!nutrition && !item.ingredients_raw) continue;
      await supabase
        .from("products")
        .update({
          nutrition,
          ingredients_raw: item.ingredients_raw ?? row.ingredients_raw,
          ocr_status: "success",
        })
        .eq("id", row.id);
      geminiOk++;
    }
    console.log(`[catalog:sync] Gemini filled: ${geminiOk}`);
  }

  // ── Score ──
  if (!skipScore) {
    let scored = 0;
    let skipped = 0;
    for (let k = 0; k < skuList.length; k += 200) {
      const chunk = skuList.slice(k, k + 200);
      const { data: scoreRows } = await supabase
        .from("products")
        .select("id, name, category, subcategory, ingredients_raw, nutrition, attributes")
        .in("zepto_sku", chunk);

      for (const row of scoreRows ?? []) {
        const nutrition = row.nutrition as ProductNutrition | null;
        if (!hasScoreableNutrition(nutrition)) {
          skipped++;
          continue;
        }
        const r = await persistCoreScore(
          supabase,
          {
            id: row.id as string,
            name: row.name as string,
            category: row.category as string | null,
            subcategory: row.subcategory as string | null,
            ingredients_raw: row.ingredients_raw as string | null,
            nutrition,
            attributes: row.attributes as Record<string, string> | null,
          },
          { force: true },
        );
        if (r === "scored") scored++;
      }
      if ((k + chunk.length) % 2000 === 0 || k + chunk.length >= skuList.length) {
        console.log(`[catalog:sync] scoring… ${Math.min(k + chunk.length, skuList.length)}/${skuList.length}`);
      }
    }
    console.log(`[catalog:sync] scored=${scored} skipped_no_nutrition=${skipped}`);
  }

  const { count: total } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("platform", "zepto");
  const { count: scoredCount } = await supabase
    .from("core_scores")
    .select("*", { count: "exact", head: true });

  console.log(`[catalog:sync] done. zepto_products=${total ?? 0} core_scores=${scoredCount ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

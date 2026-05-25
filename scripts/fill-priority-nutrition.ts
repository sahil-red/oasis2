#!/usr/bin/env -S pnpm tsx
/**
 * Fill nutrition + ingredients for priority SKUs using only:
 *   1) Saved Blinkit raw_payload (reparse + reconcile)
 *   2) Label OCR on product images (Gemini vision / Tesseract — no web search)
 *
 *   pnpm fill:nutrition:priority
 *   pnpm fill:nutrition:priority -- --dry-run
 *   pnpm fill:nutrition:priority -- --slug=kelloggs-chocos-...
 *   pnpm fill:nutrition:priority -- --no-ocr
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { parseBlinkitProductDetail } from "@/lib/grocery/blinkit";
import {
  hasIngredients,
  isPlatformNutritionComplete,
  nutritionIsSparse,
} from "@/lib/nutrition/completeness";
import { mergeOcrIntoProductNutrition } from "@/lib/nutrition/from-ocr";
import { reconcileNutrition } from "@/lib/nutrition/sanity";
import {
  OcrOrchestrator,
  RemoteBudgetExhausted,
  shutdownTesseract,
  type OcrBackend,
} from "@/lib/ocr";
import { geminiPoolSummary } from "@/lib/ocr/gemini-pool";
import { persistCoreScore, hasScoreableNutrition } from "@/lib/scoring/persist-core";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductNutrition } from "@/lib/supabase/types";
import type { PriorityNutritionEntry } from "./export-priority-nutrition";

loadEnv({ path: ".env.local" });

type SeedFile = {
  products: PriorityNutritionEntry[];
};

function parseArgs() {
  const argv = process.argv.slice(2);
  let slug: string | null = null;
  let backend: OcrBackend | null = null;
  for (const a of argv) {
    if (a.startsWith("--slug=")) slug = a.split("=")[1];
    if (a.startsWith("--backend=")) {
      const v = a.split("=")[1];
      if (v === "gemini" || v === "tesseract" || v === "auto") backend = v;
    }
  }
  return {
    dryRun: argv.includes("--dry-run"),
    noOcr: argv.includes("--no-ocr"),
    slug,
    backend,
  };
}

function reparseBlinkit(row: {
  zepto_sku: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  net_weight: string | null;
  ingredients_raw: string | null;
  nutrition: ProductNutrition | null;
  attributes: Record<string, string> | null;
  raw_payload: Record<string, unknown> | null;
}): {
  nutrition: ProductNutrition | null;
  ingredients_raw: string | null;
  attributes: Record<string, string>;
} | null {
  if (!row.raw_payload) return null;
  const parsed = parseBlinkitProductDetail(row.zepto_sku, row.raw_payload);
  const attrs = {
    ...((row.attributes ?? {}) as Record<string, string>),
    ...(parsed.attributes ?? {}),
  };
  const next = reconcileNutrition({
    nutrition: parsed.nutrition ?? row.nutrition,
    attributes: attrs,
    name: parsed.name ?? row.name,
    category: row.category,
    net_weight: row.net_weight,
  });
  return {
    nutrition: next,
    ingredients_raw: parsed.ingredients_raw ?? row.ingredients_raw,
    attributes: attrs,
  };
}

async function main() {
  const args = parseArgs();
  const seedPath = resolve(process.cwd(), "data/priority-nutrition-seed.json");
  const seed = JSON.parse(readFileSync(seedPath, "utf8")) as SeedFile;
  let entries = seed.products ?? [];
  if (args.slug) entries = entries.filter((e) => e.slug === args.slug || e.zepto_sku === args.slug);
  if (entries.length === 0) {
    console.error("[fill-priority-nutrition] no matching entries in seed file.");
    process.exit(1);
  }

  const supabase = adminClient();
  const orch = new OcrOrchestrator(supabase, { backend: args.backend ?? undefined });
  let blinkitFixed = 0;
  let ocrFixed = 0;
  let scored = 0;

  console.log(
    `[fill-priority-nutrition] ${entries.length} SKUs (ocr=${!args.noOcr}, ${geminiPoolSummary()})`,
  );

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const { data: row, error } = await supabase
      .from("products")
      .select(
        "id, zepto_sku, slug, name, brand, category, subcategory, net_weight, ingredients_raw, nutrition, attributes, raw_payload, image_urls",
      )
      .eq("slug", entry.slug)
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      console.warn(`[fill] missing ${entry.slug}`);
      continue;
    }

    const prefix = `[${i + 1}/${entries.length}] ${(row.name ?? entry.name).slice(0, 48)}`;
    let nutrition = row.nutrition as ProductNutrition | null;
    let ingredients_raw = row.ingredients_raw as string | null;
    let attributes = (row.attributes ?? {}) as Record<string, string>;

    const reparsed = reparseBlinkit({
      zepto_sku: row.zepto_sku,
      name: row.name,
      category: row.category,
      subcategory: row.subcategory,
      net_weight: row.net_weight,
      ingredients_raw,
      nutrition,
      attributes,
      raw_payload: row.raw_payload as Record<string, unknown> | null,
    });

    if (reparsed) {
      const changed =
        JSON.stringify(reparsed.nutrition) !== JSON.stringify(nutrition) ||
        reparsed.ingredients_raw !== ingredients_raw;
      if (changed) {
        nutrition = reparsed.nutrition;
        ingredients_raw = reparsed.ingredients_raw;
        attributes = reparsed.attributes;
        if (!args.dryRun) {
          await supabase
            .from("products")
            .update({
              nutrition,
              ingredients_raw,
              attributes,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        }
        blinkitFixed++;
        console.log(`${prefix} — blinkit reparse updated`);
      }
    }

    const needsOcr =
      !args.noOcr &&
      (!isPlatformNutritionComplete(ingredients_raw, nutrition) ||
        nutritionIsSparse(nutrition));

    if (needsOcr) {
      if (!args.dryRun && nutritionIsSparse(nutrition)) {
        await supabase
          .from("products")
          .update({ ocr_status: "pending" })
          .eq("id", row.id)
          .in("ocr_status", ["success", "no_label_found"]);
      }
      const imageUrls = ((row.image_urls ?? []) as string[]).filter((u) => !!u);
      if (imageUrls.length === 0) {
        console.log(`${prefix} — still sparse, no images for OCR`);
      } else {
        try {
          console.log(`${prefix} — OCR ${imageUrls.length} image(s)…`);
          const result = await orch.ocrProductImages(imageUrls);
          if (result?.payload) {
            const merged = mergeOcrIntoProductNutrition(
              nutrition,
              result.payload.nutrition_per_100g,
            );
            if (!ingredients_raw && result.payload.ingredients?.length) {
              ingredients_raw = result.payload.ingredients
                .map((ing) =>
                  ing.percent != null ? `${ing.name} (${ing.percent}%)` : ing.name,
                )
                .join(", ");
            }
            const patch: Record<string, unknown> = {
              ocr_image_url: result.imageUrl,
              ocr_payload: result.payload,
              ocr_status:
                result.payload.confidence.has_ingredients ||
                result.payload.confidence.has_nutrition_table
                  ? "success"
                  : "no_label_found",
              ocr_attempted_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (merged && JSON.stringify(merged) !== JSON.stringify(nutrition)) {
              nutrition = merged;
              patch.nutrition = merged;
            }
            if (ingredients_raw) patch.ingredients_raw = ingredients_raw;
            if (!args.dryRun) {
              await supabase.from("products").update(patch).eq("id", row.id);
            }
            ocrFixed++;
            console.log(
              `${prefix} — OCR ok ingredients=${result.payload.confidence.has_ingredients} ` +
                `nutrition=${result.payload.confidence.has_nutrition_table}`,
            );
          } else {
            console.log(`${prefix} — OCR found no label`);
          }
        } catch (err) {
          if (err instanceof RemoteBudgetExhausted) {
            console.warn("[fill-priority-nutrition] Gemini OCR budget exhausted.");
            break;
          }
          console.warn(`${prefix} — OCR failed: ${(err as Error).message}`);
        }
      }
    }

    if (!args.dryRun && hasScoreableNutrition(nutrition)) {
      const r = await persistCoreScore(
        supabase,
        {
          id: row.id,
          name: row.name,
          category: row.category,
          subcategory: row.subcategory,
          ingredients_raw,
          nutrition,
          attributes,
        },
        { force: true },
      );
      if (r === "scored") scored++;
    }
  }

  await shutdownTesseract();
  console.log(
    `[fill-priority-nutrition] done. blinkit=${blinkitFixed} ocr=${ocrFixed} rescored=${scored}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

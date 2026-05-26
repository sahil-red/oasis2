#!/usr/bin/env -S pnpm tsx
/**
 * Run Apple Vision OCR on a few catalog products (dry-run prints only).
 *   pnpm ocr:sample
 *   pnpm ocr:sample -- --limit=2 --apply
 */
import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import { applyOcrToProduct } from "@/lib/ocr/apply-to-product";
import { OcrOrchestrator, paddleSummary } from "@/lib/ocr";
import { persistCoreScore } from "@/lib/scoring/persist-core";
import { needsLabelOcr } from "@/lib/nutrition/completeness";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

async function main() {
  const argv = process.argv.slice(2);
  const limit = Number(argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 2);
  const apply = argv.includes("--apply");
  const force = argv.includes("--force");

  const supabase = adminClient();
  const orch = new OcrOrchestrator(supabase, { bypassCache: argv.includes("--bypass-cache") });

  const { data, error } = await supabase
    .from("products")
    .select("id, name, image_urls, ingredients_raw, nutrition, net_weight, category")
    .eq("platform", "zepto")
    .not("image_urls", "is", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const candidates = (data ?? []).filter((row) =>
    needsLabelOcr(row.ingredients_raw, row.nutrition as ProductNutrition | null),
  );
  const sample = candidates.slice(0, limit);

  console.log(`[ocr:sample] backend=${paddleSummary()} candidates=${candidates.length} running=${sample.length}`);

  for (const row of sample) {
    const name = (row.name as string)?.slice(0, 56) ?? row.id;
    const urls = (row.image_urls as string[])?.filter(Boolean) ?? [];
    console.log(`\n── ${name} (${urls.length} images) ──`);

    const result = await orch.ocrProductImages(urls);
    if (!result) {
      console.log("  no OCR result");
      continue;
    }

    const text = result.payload.raw_text ?? "";
    console.log(`  image: ${result.imageUrl.slice(0, 72)}…`);
    console.log(`  confidence: ${result.payload.confidence.overall.toFixed(2)}`);
    console.log(`  ingredients (${result.payload.ingredients.length}):`, result.payload.ingredients.slice(0, 6).map((i) => i.name).join(", "));
    console.log(`  nutrition keys:`, Object.keys(result.payload.nutrition_per_100g ?? {}).join(", "));
    console.log(`  text preview:\n${text.slice(0, 500).replace(/\n/g, "\n    ")}`);

    if (!apply) continue;

    const outcome = applyOcrToProduct(
      {
        ingredients_raw: row.ingredients_raw as string | null,
        nutrition: row.nutrition as ProductNutrition | null,
        net_weight: row.net_weight as string | null,
      },
      { payload: result.payload, imageUrl: result.imageUrl },
      { force },
    );

    await supabase.from("products").update(outcome.patch).eq("id", row.id);

    const nutrition = (outcome.patch.nutrition ?? row.nutrition) as ProductNutrition | null;
    const scoreStatus = await persistCoreScore(
      supabase,
      {
        id: row.id as string,
        name: row.name as string,
        category: row.category as string | null,
        subcategory: null,
        ingredients_raw: (outcome.patch.ingredients_raw ?? row.ingredients_raw) as string | null,
        nutrition,
        attributes: null,
      },
      { force: true },
    );
    console.log(`  applied=${outcome.applied} gate=${outcome.gate_reason} score=${scoreStatus}`);
  }

  if (!apply) {
    console.log("\n[ocr:sample] dry-run only — pass --apply to write DB + refresh scores");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

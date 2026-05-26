#!/usr/bin/env -S pnpm tsx
/**
 * Audit catalog completeness: images, scores, PDP fields, nutrition, ingredients.
 *   pnpm audit:catalog
 */
import { config as loadEnv } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import {
  countNutritionFields,
  hasIngredients,
  isPlatformNutritionComplete,
} from "@/lib/nutrition/completeness";

loadEnv({ path: ".env.local" });

async function main() {
  const supabase = adminClient();
  const page = 500;
  let offset = 0;
  const stats = {
    total: 0,
    catalog_visible: 0,
    with_images: 0,
    multi_image: 0,
    with_score: 0,
    with_ingredients: 0,
    with_nutrition_2plus: 0,
    platform_complete: 0,
    with_slug: 0,
    with_ocr_payload: 0,
    ocr_success: 0,
  };

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, slug, catalog_visible, image_urls, ingredients_raw, nutrition, ocr_status, ocr_payload, core_scores ( score )",
      )
      .eq("platform", "zepto")
      .range(offset, offset + page - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      stats.total++;
      if (row.catalog_visible) stats.catalog_visible++;
      const imgs = (row.image_urls as string[] | null) ?? [];
      if (imgs.length) stats.with_images++;
      if (imgs.length > 1) stats.multi_image++;
      if (row.core_scores) stats.with_score++;
      if (hasIngredients(row.ingredients_raw as string | null)) stats.with_ingredients++;
      if (countNutritionFields(row.nutrition) >= 2) stats.with_nutrition_2plus++;
      if (
        isPlatformNutritionComplete(
          row.ingredients_raw as string | null,
          row.nutrition as Parameters<typeof isPlatformNutritionComplete>[1],
        )
      ) {
        stats.platform_complete++;
      }
      if (row.slug) stats.with_slug++;
      if (row.ocr_payload) stats.with_ocr_payload++;
      if (row.ocr_status === "success") stats.ocr_success++;
    }

    if (data.length < page) break;
    offset += page;
  }

  const pct = (n: number) =>
    stats.total ? `${((100 * n) / stats.total).toFixed(1)}%` : "n/a";

  console.log(JSON.stringify({ audit: "catalog-readiness", ...stats }, null, 2));
  console.log("\n── coverage ──");
  console.log(`  images:            ${stats.with_images} (${pct(stats.with_images)})`);
  console.log(`  multi-image:       ${stats.multi_image} (${pct(stats.multi_image)})`);
  console.log(`  core_scores:       ${stats.with_score} (${pct(stats.with_score)})`);
  console.log(`  ingredients:       ${stats.with_ingredients} (${pct(stats.with_ingredients)})`);
  console.log(`  nutrition (2+):    ${stats.with_nutrition_2plus} (${pct(stats.with_nutrition_2plus)})`);
  console.log(`  platform-complete: ${stats.platform_complete} (${pct(stats.platform_complete)})`);
  console.log(`  catalog_visible:   ${stats.catalog_visible} (${pct(stats.catalog_visible)})`);
  console.log(`  PDP slug:          ${stats.with_slug} (${pct(stats.with_slug)})`);
  console.log(`  ocr_payload:       ${stats.with_ocr_payload} (${pct(stats.with_ocr_payload)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env -S pnpm tsx
import { config } from "dotenv";
import { adminClient } from "@/lib/supabase/admin";
import {
  hasIngredients,
  isPlatformNutritionComplete,
  nutritionIsSparse,
} from "@/lib/nutrition/completeness";

config({ path: ".env.local" });

async function main() {
  const s = adminClient();
  const pageSize = 1000;
  let offset = 0;
  let total = 0;
  let withNutrition = 0;
  let catalogComplete = 0;
  let missingNutrition = 0;
  let missingIngredients = 0;
  let needsReference = 0;
  let ocrPending = 0;
  let ocrSuccess = 0;
  let ocrRetryable = 0;
  let hasImages = 0;
  let ocrCandidates = 0;

  while (true) {
    const { data, error } = await s
      .from("products")
      .select("nutrition, ingredients_raw, image_urls, ocr_status")
      .eq("platform", "zepto")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      total++;
      const nutrition = row.nutrition as Record<string, unknown> | null;
      const ingredients = row.ingredients_raw as string | null;
      const images = (row.image_urls as string[] | null) ?? [];
      const complete = isPlatformNutritionComplete(ingredients, nutrition);

      if (nutrition && Object.keys(nutrition).length > 0) withNutrition++;
      if (complete) catalogComplete++;
      if (nutritionIsSparse(nutrition)) missingNutrition++;
      if (!hasIngredients(ingredients)) missingIngredients++;
      if (!complete && (nutritionIsSparse(nutrition) || !hasIngredients(ingredients))) {
        needsReference++;
      }
      if (row.ocr_status === "pending") ocrPending++;
      if (row.ocr_status === "success") ocrSuccess++;
      if (row.ocr_status === "failed" || row.ocr_status === "no_label_found") {
        ocrRetryable++;
      }
      if (images.length > 0) hasImages++;
      if (!complete && images.length > 0) ocrCandidates++;
    }

    offset += pageSize;
    if (data.length < pageSize) break;
  }

  console.log(
    JSON.stringify(
      {
        platform: "zepto",
        total,
        withNutrition,
        catalogComplete,
        missingNutrition,
        missingIngredients,
        needsReferenceOrOcr: needsReference,
        hasImages,
        ocrCandidates,
        ocrPending,
        ocrSuccess,
        ocrRetryable,
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

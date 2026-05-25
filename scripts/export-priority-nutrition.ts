#!/usr/bin/env -S pnpm tsx
/**
 * Export the worst nutrition gaps into data/priority-nutrition-seed.json
 * for scripts/fill-priority-nutrition.ts (Blinkit reparse → label OCR).
 *
 *   pnpm export:nutrition:priority
 *   pnpm export:nutrition:priority -- --limit=60
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import {
  countNutritionFields,
  hasIngredients,
  nutritionIsSparse,
} from "@/lib/nutrition/completeness";
import { adminClient } from "@/lib/supabase/admin";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

export type PriorityNutritionEntry = {
  slug: string;
  zepto_sku: string;
  name: string;
  brand: string | null;
  nutrition_fields: number;
  missing_ingredients: boolean;
  has_raw_payload: boolean;
  image_count: number;
};

async function main() {
  const limitArg = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 60);
  const supabase = adminClient();
  const candidates: PriorityNutritionEntry[] = [];
  let offset = 0;
  const page = 100;

  while (candidates.length < limitArg * 3 && offset < 5000) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "slug, zepto_sku, name, brand, ingredients_raw, nutrition, raw_payload, image_urls",
      )
      .eq("platform", "blinkit")
      .order("updated_at", { ascending: false })
      .range(offset, offset + page - 1);

    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const nutrition = row.nutrition as ProductNutrition | null;
      const sparse = nutritionIsSparse(nutrition);
      const noIng = !hasIngredients(row.ingredients_raw);
      if (!sparse && !noIng) continue;

      const fields = countNutritionFields(nutrition);
      const images = (row.image_urls ?? []).filter(Boolean);
      candidates.push({
        slug: row.slug,
        zepto_sku: row.zepto_sku,
        name: row.name,
        brand: row.brand,
        nutrition_fields: fields,
        missing_ingredients: noIng,
        has_raw_payload: Boolean(row.raw_payload),
        image_count: images.length,
      });
    }

    offset += page;
  }

  candidates.sort((a, b) => {
    const score = (e: PriorityNutritionEntry) =>
      (e.missing_ingredients ? 4 : 0) +
      (e.nutrition_fields === 0 ? 3 : e.nutrition_fields <= 2 ? 2 : 1) +
      (e.has_raw_payload ? 1 : 0) +
      (e.image_count > 0 ? 1 : 0);
    return score(b) - score(a);
  });

  const picked = candidates.slice(0, limitArg);
  const outPath = resolve(process.cwd(), "data/priority-nutrition-seed.json");
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        count: picked.length,
        products: picked,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`[export-priority-nutrition] wrote ${picked.length} → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

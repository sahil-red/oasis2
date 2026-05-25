#!/usr/bin/env -S pnpm tsx
/**
 * Fix products with implausible nutrition (usually bad OCR) by re-reading
 * Blinkit "Nutrition Information" blocks and reconciling with sanity rules.
 */
import { config as loadEnv } from "dotenv";
import { parseBlinkitProductDetail } from "@/lib/grocery/blinkit";
import {
  nutritionLooksImplausible,
  reconcileNutrition,
} from "@/lib/nutrition/sanity";
import { adminClient } from "@/lib/supabase/admin";
import { persistCoreScore, hasScoreableNutrition } from "@/lib/scoring/persist-core";
import type { ProductNutrition } from "@/lib/supabase/types";

loadEnv({ path: ".env.local" });

async function main() {
  const nameQ = process.argv.find((a) => a.startsWith("--name="))?.split("=")[1];
  const supabase = adminClient();
  let offset = 0;
  const page = 50;
  let fixed = 0;

  while (true) {
    let q = supabase
      .from("products")
      .select(
        "id, zepto_sku, name, category, subcategory, net_weight, ingredients_raw, nutrition, attributes, raw_payload",
      )
      .not("nutrition", "is", null);
    if (nameQ) q = q.ilike("name", `%${nameQ}%`);

    const { data, error } = await q.range(offset, offset + page - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const prev = row.nutrition as ProductNutrition;
      if (!nutritionLooksImplausible(prev, row.name, row.category)) continue;

      const attrs = (row.attributes ?? {}) as Record<string, string>;
      let next: ProductNutrition | null = reconcileNutrition({
        nutrition: prev,
        attributes: attrs,
        name: row.name,
        category: row.category,
        net_weight: row.net_weight,
      });

      if (row.raw_payload) {
        const parsed = parseBlinkitProductDetail(row.zepto_sku, row.raw_payload as Record<string, unknown>);
        const mergedAttrs = { ...attrs, ...(parsed.attributes ?? {}) };
        next = reconcileNutrition({
          nutrition: parsed.nutrition ?? prev,
          attributes: mergedAttrs,
          name: parsed.name ?? row.name,
          category: row.category,
          net_weight: row.net_weight,
        });
      }

      if (!next || JSON.stringify(prev) === JSON.stringify(next)) continue;
      if (nutritionLooksImplausible(next, row.name, row.category)) continue;

      await supabase.from("products").update({ nutrition: next }).eq("id", row.id);
      fixed++;
      console.log(`[fix] ${row.name}`);
      console.log(`  was protein=${prev.protein_g_100g} kcal=${prev.energy_kcal_100g}`);
      console.log(`  now protein=${next.protein_g_100g} kcal=${next.energy_kcal_100g}`);

      if (hasScoreableNutrition(next)) {
        await persistCoreScore(
          supabase,
          {
            id: row.id,
            name: row.name,
            category: row.category,
            subcategory: row.subcategory,
            ingredients_raw: row.ingredients_raw,
            nutrition: next,
            attributes: attrs,
          },
          { force: true },
        );
      }
    }

    if (data.length < page) break;
    offset += page;
  }

  console.log(`[fix-nutrition-outliers] done. fixed=${fixed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
